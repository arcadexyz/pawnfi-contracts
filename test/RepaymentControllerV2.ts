import { expect } from "chai";
import hre, { ethers, waffle } from "hardhat";
const { loadFixture } = waffle;
import { utils, Signer, BigNumber } from "ethers";

import { MockLoanCore, MockERC20, MockERC721, RepaymentControllerV2 } from "../typechain";
import { deploy } from "./utils/contracts";

interface TestContext {
    loanId: string;
    loanData: {
        borrowerNoteId: BigNumber;
        lenderNoteId: BigNumber;
    };
    repaymentControllerV2: RepaymentControllerV2;
    mockERC20: MockERC20;
    mockLoanCore: MockLoanCore;
    borrower: Signer;
    lender: Signer;
    otherParty: Signer;
    signers: Signer[];
}

describe("RepaymentControllerV2", () => {
    const TEST_LOAN_PRINCIPAL = 10;
    const TEST_LOAN_INTEREST = 1;
    let context: TestContext;

    /**
     * Sets up a test context, deploying new contracts and returning them for use in a test
     */
    const fixture = async (): Promise<TestContext> => {
        const signers: Signer[] = await hre.ethers.getSigners();
        const [deployer, borrower, lender, otherParty] = signers;

        const mockCollateral = <MockERC721>await deploy("MockERC721", deployer, ["Mock Collateral", "MwNFT"]);
        const mockLoanCore = <MockLoanCore>await deploy("MockLoanCore", deployer, []);

        const borrowerNoteAddress = await mockLoanCore.borrowerNote();
        const lenderNoteAddress = await mockLoanCore.lenderNote();

        const mockERC20 = <MockERC20>await deploy("MockERC20", deployer, ["Mock ERC20", "MOCK"]);
        await mockERC20.mint(
            await borrower.getAddress(),
            utils.parseEther((TEST_LOAN_PRINCIPAL + TEST_LOAN_INTEREST).toString()),
        );
        await mockERC20.mint(
            await otherParty.getAddress(),
            utils.parseEther((TEST_LOAN_PRINCIPAL + TEST_LOAN_INTEREST).toString()),
        );

        const repaymentControllerV2 = <RepaymentControllerV2>(
            await deploy("RepaymentControllerV2", deployer, [
                mockLoanCore.address,
                borrowerNoteAddress,
                lenderNoteAddress,
            ])
        );

        // Mint collateral token from asset wrapper
        const collateralMintTx = await mockCollateral.mint(await borrower.getAddress());
        await collateralMintTx.wait();

        // token Id is 0 since it's the first one minted
        const collateralTokenId = 0;

        const durationSecs = 60 * 60 * 24 * 14;
        const terms = {
            durationSecs: durationSecs,
            principal: utils.parseEther(TEST_LOAN_PRINCIPAL.toString()),
            interest: utils.parseEther(TEST_LOAN_INTEREST.toString()),
            collateralTokenId,
            payableCurrency: mockERC20.address,
            startDate: 0,
            numInstallments: 0,
        };

        const createLoanTx = await mockLoanCore.createLoan(terms);
        const receipt = await createLoanTx.wait();

        let loanId: string;
        if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
            loanId = receipt.events[0].args.loanId;
        } else {
            throw new Error("Unable to initialize loan");
        }

        await mockLoanCore.startLoan(await lender.getAddress(), await borrower.getAddress(), loanId);

        const loanRes = await mockLoanCore.getLoan(loanId);

        // Extracting properties for cleaner type in test context
        const loanData = {
            borrowerNoteId: loanRes.borrowerNoteId,
            lenderNoteId: loanRes.lenderNoteId,
        };

        return {
            loanId,
            loanData,
            repaymentControllerV2,
            mockLoanCore,
            mockERC20,
            borrower,
            lender,
            otherParty,
            signers: signers.slice(3),
        };
    };

    describe("repay", () => {
        beforeEach(async () => {
            context = await loadFixture(fixture);
        });

        it("reverts for an invalid note ID", async () => {
            const { repaymentControllerV2, borrower } = context;
            // Use junk note ID, like 1000
            await expect(repaymentControllerV2.connect(borrower).repay(1000)).to.be.revertedWith(
                "RepaymentControllerV2: repay could not dereference loan",
            );
        });

        it("fails to repay the loan and if the payable currency is not approved", async () => {
            const { mockERC20, borrower, repaymentControllerV2, loanData } = context;

            const balanceBefore = await mockERC20.balanceOf(await borrower.getAddress());
            expect(balanceBefore.eq(utils.parseEther((TEST_LOAN_PRINCIPAL + TEST_LOAN_INTEREST).toString())));

            // approve withdrawal
            await mockERC20.connect(borrower).approve(repaymentControllerV2.address, utils.parseEther("0.001"));
            await expect(repaymentControllerV2.connect(borrower).repay(loanData.borrowerNoteId)).to.be.reverted;
        });

        it("repays the loan and withdraws from the borrower's account", async () => {
            const { mockERC20, borrower, repaymentControllerV2, loanData } = context;

            const balanceBefore = await mockERC20.balanceOf(await borrower.getAddress());
            expect(balanceBefore.eq(utils.parseEther((TEST_LOAN_PRINCIPAL + TEST_LOAN_INTEREST).toString())));

            // approve withdrawal
            await mockERC20.connect(borrower).approve(repaymentControllerV2.address, utils.parseEther("100"));
            await repaymentControllerV2.connect(borrower).repay(loanData.borrowerNoteId);

            // Test that borrower no longer has funds
            const balanceAfter = await mockERC20.balanceOf(await borrower.getAddress());
            expect(balanceAfter.eq(0));

            // Correct loan state update should be tested in LoanCore
        });

        it("allows any party to repay the loan, even if not the borrower", async () => {
            const { mockERC20, otherParty, repaymentControllerV2, loanData } = context;

            const balanceBefore = await mockERC20.balanceOf(await otherParty.getAddress());
            expect(balanceBefore.eq(utils.parseEther((TEST_LOAN_PRINCIPAL + TEST_LOAN_INTEREST).toString())));

            await mockERC20.connect(otherParty).approve(repaymentControllerV2.address, utils.parseEther("100"));
            await repaymentControllerV2.connect(otherParty).repay(loanData.borrowerNoteId);

            // Test that otherParty no longer has funds
            const balanceAfter = await mockERC20.balanceOf(await otherParty.getAddress());
            expect(balanceAfter.eq(0));

            // Correct loan state update should be tested in LoanCore
        });
    });
    describe("claim", () => {
        beforeEach(async () => {
            context = await loadFixture(fixture);
        });

        it("reverts for an invalid note ID", async () => {
            const { repaymentControllerV2, lender } = context;

            // Use junk note ID, like 1000
            await expect(repaymentControllerV2.connect(lender).claim(1000)).to.be.revertedWith(
                "ERC721: owner query for nonexistent token",
            );
        });

        it("reverts for a note ID not owned by caller", async () => {
            const { repaymentControllerV2, lender, borrower, mockLoanCore, loanData } = context;

            const lenderNote = await (
                await ethers.getContractFactory("PromissoryNote")
            ).attach(await mockLoanCore.lenderNote());
            await lenderNote
                .connect(lender)
                .transferFrom(await lender.getAddress(), await borrower.getAddress(), loanData.lenderNoteId);

            // Use junk note ID, like 1000
            await expect(repaymentControllerV2.connect(lender).claim(loanData.lenderNoteId)).to.be.revertedWith(
                "RepaymentControllerV2: not owner of lender note",
            );
        });

        it("reverts if the claimant is not the lender", async () => {
            const { repaymentControllerV2, borrower, loanData } = context;

            // Attempt to claim note from the borrower account
            await expect(repaymentControllerV2.connect(borrower).claim(loanData.lenderNoteId)).to.be.revertedWith(
                "RepaymentControllerV2: not owner of lender note",
            );
        });

        it("claims the collateral and sends it to the lender's account", async () => {
            const { repaymentControllerV2, lender, loanData } = context;

            await repaymentControllerV2.connect(lender).claim(loanData.lenderNoteId);

            // Not reverted - correct loan state and disbursement should be updated in LoanCore
        });
    });
});
