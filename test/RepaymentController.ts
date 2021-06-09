import { expect } from "chai";
import hre from "hardhat";
import { utils, BigNumber, BigNumberish, Signer } from "ethers";

import { MockLoanCore, MockERC20, MockERC721 } from "../typechain";
import { deploy } from "./utils/contracts";
import { TransactionDescription } from "ethers/lib/utils";

interface TestContext {
    loanId: string;
    mockERC20: MockERC20;
    mockBorrowerNote: MockERC721;
    mockLenderNote: MockERC721;
    borrower: Signer;
    lender: Signer;
    signers: Signer[];
}

describe("RepaymentController", () => {
    /**
     * Sets up a test context, deploying new contracts and returning them for use in a test
     */
    const setupTestContext = async (): Promise<TestContext> => {
        const signers: Signer[] = await hre.ethers.getSigners();
        const [deployer, borrower, lender] = signers;

        const mockBorrowerNote = <MockERC721>await deploy("MockERC721", deployer, ["Mock BorrowerNote", "MB"]);
        const mockLenderNote = <MockERC721>await deploy("MockERC721", deployer, ["Mock LenderNote", "ML"]);
        const mockAssetWrapper = <MockERC721>await deploy("MockERC721", deployer, ["Mock AssetWrapper", "MA"]);
        const mockCollateral = <MockERC721>await deploy("MockERC721", deployer, ["Mock Collateral", "McNFT"]);
        const mockLoanCore = <MockLoanCore>(
            await deploy("MockLoanCore", deployer, [mockBorrowerNote.address, mockLenderNote.address, mockAssetWrapper.address])
        );
        const mockERC20 = <MockERC20>await deploy("MockERC20", deployer, ["Mock ERC20", "MOCK"]);

        // Mint collateral token from asset wrapper
        const collateralMintTx = await mockCollateral.mint(await borrower.getAddress());
        await collateralMintTx.wait();

        // token Id is 0 since it's the first one minted
        const collateralTokenId = 0;

        const dueDate = (Date.now() / 1000) + (60 * 60 * 24 * 14)
        const terms = {
            dueDate: BigNumber.from(dueDate),
            principal: utils.parseEther('10'),
            interest: utils.parseEther('1'),
            collateralTokenId,
            payableCurrency: mockERC20.address
        };

        const createLoanTx = await mockLoanCore.createLoan(terms);
        const receipt = await createLoanTx.wait();

        let loanId: string;
        if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
            loanId = receipt.events[0].args.loanId;
        } else {
            throw new Error("Unable to initialize loan");
        }

        return {
            loanId,
            mockBorrowerNote,
            mockLenderNote,
            mockERC20,
            borrower,
            lender,
            signers: signers.slice(3),
        };
    };

    describe("repay", () => {
        let context: TestContext;

        before(async () => {
            context = await setupTestContext();
        });

        it("reverts for an invalid note ID", async () => {
            
        });

        it("repays the loan and withdraws from the borrower's account", async () => {

        });
    });
    describe("claim", () => {
        it("reverts for an invalid note ID");
        it("reverts if the claimant is not the lender");
        it("claims the collateral and sends it to the lender's account");

    });
}); 