import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";

import {
    AssetWrapper,
    FeeController,
    OriginationController,
    PromissoryNote,
    RepaymentController,
    LoanCore,
    FlashRollover,
    MockLendingPool,
    MockAddressesProvider,
    MockERC20,
} from "../typechain";
import { deploy } from "./utils/contracts";
import { approve, mint } from "./utils/erc20";
import { LoanTerms, LoanData } from "./utils/types";
import { createLoanTermsSignature } from "./utils/eip712";

interface VersionedContracts {
    loanCore: LoanCore;
    borrowerNote: PromissoryNote;
    lenderNote: PromissoryNote;
    repaymentController: RepaymentController;
    originationController: OriginationController;
}

interface TestContext {
    current: VersionedContracts;
    legacy: VersionedContracts;
    common: {
        mockERC20: MockERC20;
        assetWrapper: AssetWrapper;
        flashRollover: FlashRollover;
        lendingPool: MockLendingPool;
    }
    borrower: SignerWithAddress;
    lender: SignerWithAddress;
    admin: SignerWithAddress;
}

interface LoanDef {
    loanId: BigNumber;
    bundleId: BigNumber;
    loanTerms: LoanTerms;
    loanData: LoanData;
}

const ORIGINATOR_ROLE = "0x59abfac6520ec36a6556b2a4dd949cc40007459bcd5cd2507f1e5cc77b6bc97e";
const REPAYER_ROLE = "0x9c60024347074fd9de2c1e36003080d22dbc76a41ef87444d21e361bcb39118e";


describe("FlashRollover", () => {
    /**
     * Sets up a test context, deploying new contracts and returning them for use in a test
     */
    const setupTestContext = async (): Promise<TestContext> => {
        const signers: SignerWithAddress[] = await hre.ethers.getSigners();
        const [borrower, lender, admin] = signers;

        const assetWrapper = <AssetWrapper>await deploy("AssetWrapper", admin, ["AssetWrapper", "MA"]);
        const feeController = <FeeController>await deploy("FeeController", admin, []);
        const mockERC20 = <MockERC20>await deploy("MockERC20", admin, ["Mock ERC20", "MOCK"]);

        const deployLoanCore = async () => {
            const loanCore = <LoanCore>await deploy("LoanCore", admin, [assetWrapper.address, feeController.address]);

            const borrowerNoteAddress = await loanCore.borrowerNote();
            const borrowerNote = <PromissoryNote>(
                (await ethers.getContractFactory("PromissoryNote")).attach(borrowerNoteAddress)
            );

            const lenderNoteAddress = await loanCore.lenderNote();
            const lenderNote = <PromissoryNote>(
                (await ethers.getContractFactory("PromissoryNote")).attach(lenderNoteAddress)
            );

            const repaymentController = <RepaymentController>(
                await deploy("RepaymentController", admin, [loanCore.address, borrowerNoteAddress, lenderNoteAddress])
            );
            await repaymentController.deployed();
            const updateRepaymentControllerPermissions = await loanCore.grantRole(
                REPAYER_ROLE,
                repaymentController.address,
            );
            await updateRepaymentControllerPermissions.wait();

            const originationController = <OriginationController>(
                await deploy("OriginationController", admin, [loanCore.address, assetWrapper.address])
            );
            await originationController.deployed();
            const updateOriginationControllerPermissions = await loanCore.grantRole(
                ORIGINATOR_ROLE,
                originationController.address,
            );
            await updateOriginationControllerPermissions.wait();

            return {
                loanCore,
                borrowerNote,
                lenderNote,
                originationController,
                repaymentController
            }
        }

        const legacyLoanCore = await deployLoanCore();
        const currentLoanCore = await deployLoanCore();

        // Create and fund lending pool
        const lendingPool = <MockLendingPool>await deploy("MockLendingPool", admin, []);
        await mockERC20.connect(admin).mint(lendingPool.address, hre.ethers.utils.parseEther("1000000"));

        const addressesProvider = <MockAddressesProvider>await deploy("MockAddressesProvider", admin, [lendingPool.address]);
        const flashRollover = <FlashRollover>await deploy("FlashRollover", admin, [
            addressesProvider.address,
            currentLoanCore.loanCore.address,
            legacyLoanCore.loanCore.address,
            currentLoanCore.originationController.address,
            currentLoanCore.repaymentController.address,
            legacyLoanCore.repaymentController.address,
            currentLoanCore.borrowerNote.address,
            legacyLoanCore.borrowerNote.address,
            currentLoanCore.lenderNote.address,
            legacyLoanCore.lenderNote.address,
            assetWrapper.address,
            feeController.address
        ]);

        return {
            legacy: legacyLoanCore,
            current: currentLoanCore,
            common: {
                mockERC20,
                assetWrapper,
                lendingPool,
                flashRollover
            },
            borrower,
            lender,
            admin
        };
    };

    /**
     * Create a LoanTerms object using the given parameters, or defaults
     */
    const createLoanTerms = (
        payableCurrency: string,
        {
            durationSecs = 3600000,
            principal = hre.ethers.utils.parseEther("100"),
            interest = hre.ethers.utils.parseEther("1"),
            collateralTokenId = BigNumber.from(1),
        }: Partial<LoanTerms> = {},
    ): LoanTerms => {
        return {
            durationSecs,
            principal,
            interest,
            collateralTokenId,
            payableCurrency,
        };
    };

    const createWnft = async (assetWrapper: AssetWrapper, user: SignerWithAddress): Promise<BigNumber> => {
        const tx = await assetWrapper.initializeBundle(await user.getAddress());
        const receipt = await tx.wait();
        if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
            return receipt.events[0].args.tokenId;
        } else {
            throw new Error("Unable to initialize bundle");
        }
    };

    const createLoan = async (ctx: TestContext, contracts: VersionedContracts): Promise<LoanDef> => {
        const { lender, borrower } = ctx;
        const { originationController, loanCore } = contracts;
        const { mockERC20, assetWrapper } = ctx.common;

        const bundleId = await createWnft(assetWrapper, borrower);
        const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
        await mint(mockERC20, lender, loanTerms.principal);

        const { v, r, s } = await createLoanTermsSignature(
            originationController.address,
            "OriginationController",
            loanTerms,
            borrower,
        );

        await approve(mockERC20, lender, originationController.address, loanTerms.principal);
        await assetWrapper.connect(borrower).approve(originationController.address, bundleId);

        const tx = await originationController
            .connect(lender)
            .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s);
        const receipt = await tx.wait();

        let loanId;

        if (receipt && receipt.events && receipt.events.length == 15) {
            const LoanCreatedLog = new hre.ethers.utils.Interface([
                "event LoanStarted(uint256 loanId, address lender, address borrower)",
            ]);
            const log = LoanCreatedLog.parseLog(receipt.events[14]);
            loanId = log.args.loanId;
        } else {
            throw new Error("Unable to initialize loan");
        }

        return {
            loanId,
            bundleId,
            loanTerms,
            loanData: await loanCore.getLoan(loanId),
        };
    };

    describe("Loan Rollover", () => {
        let ctx: TestContext;
        let flashRollover: FlashRollover;

        before(async () => {
            ctx = await setupTestContext();
            flashRollover = ctx.common.flashRollover;
        });

        it("should revert for an unknown loan ID", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                current: currentContracts
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, currentContracts);

            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            await expect(
                flashRollover.connect(borrower).rolloverLoan(false, BigNumber.from(loanId).mul(2), loanTerms, v, r, s)
            ).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("should revert if caller is not the borrower", async () => {
            const {
                common: { mockERC20 },
                lender,
                admin,
                current: currentContracts
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, currentContracts);

            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            await expect(
                flashRollover.connect(admin).rolloverLoan(false, loanId, loanTerms, v, r, s)
            ).to.be.revertedWith("Rollover: borrower only");
        });

        it("should revert if new loan currency does not match old loan", async () => {
            const {
                lender,
                borrower,
                admin,
                current: currentContracts
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, currentContracts);

            const otherMockERC20 = <MockERC20>await deploy("MockERC20", admin, ["Mock ERC20", "MOCK"]);
            const loanTerms = createLoanTerms(otherMockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            await expect(
                flashRollover.connect(borrower).rolloverLoan(false, loanId, loanTerms, v, r, s)
            ).to.be.revertedWith("Currency mismatch");
        });

        it("should revert if new loan collateral token does not match old loan", async () => {
            const {
                common: { mockERC20, assetWrapper },
                lender,
                borrower,
                current: currentContracts
            } = ctx;
            const { loanId } = await createLoan(ctx, currentContracts);

            const otherBundleId = await createWnft(assetWrapper, borrower);
            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: otherBundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            await expect(
                flashRollover.connect(borrower).rolloverLoan(false, loanId, loanTerms, v, r, s)
            ).to.be.revertedWith("Collateral mismatch");
        });

        it("should revert if borrower cannot cover flash loan balance", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                admin,
                current: currentContracts
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, currentContracts);

            // Drain borrower wallet of token and issue a smaller loan
            await mockERC20.connect(borrower).transfer(admin.address, await mockERC20.balanceOf(borrower.address));
            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal: hre.ethers.utils.parseEther("50")
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            await expect(
                flashRollover.connect(borrower).rolloverLoan(false, loanId, loanTerms, v, r, s)
            ).to.be.revertedWith("Borrower cannot pay");
        });

        it("should revert if new loan terms do not match signature");
        it("should issue a new loan and disburse extra funds to the borrower", async () => {
            // Check that borrower owns borrower note
            // Check that loanCore owns collateral
            // Check that borrower received extra principal
        });
        it("should issue a new loan and withdraw needed funds to the borrower", async () => {
            // Check that borrower owns borrower note
            // Check that loanCore owns collateral
            // Check that borrower balance was deducted
        });
    });

    describe("Legacy Loan Rollover (Migration) ", () => {
        it("should revert for an unknown loan ID");
        it("should revert if caller is not the borrower");
        it("should revert if new loan currency does not match old loan");
        it("should revert if new loan collateral token does not match old loan");
        it("should revert if borrower cannot cover flash loan balance");
        it("should revert if new loan terms do not match signature");
        it("should issue a new loan and disburse extra funds to the borrower", async () => {
            // Check that borrower owns borrower note
            // Check that loanCore owns collateral
            // Check that borrower received extra principal
        });
        it("should issue a new loan and withdraw needed funds to the borrower", async () => {
            // Check that borrower owns borrower note
            // Check that loanCore owns collateral
            // Check that borrower balance was deducted
        });
    });

    describe("executeOperation", () => {
        it("should revert if not called by the lending pool");
        it("should revert if flash loan initiator does not match contract");
        it("should revert if funds are not received");
    });
});
