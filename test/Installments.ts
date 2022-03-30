import { expect } from "chai";
import hre, { ethers, waffle } from "hardhat";
const { loadFixture } = waffle;
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";

import {
    AssetWrapper,
    FeeController,
    OriginationController,
    PromissoryNote,
    RepaymentControllerV2,
    LoanCoreV2,
    MockERC20,
} from "../typechain";
import { BlockchainTime } from "./utils/time";
import { deploy } from "./utils/contracts";
import { approve, mint } from "./utils/erc20";
import { LoanTerms, LoanData } from "./utils/types";
import { createLoanTermsSignature } from "./utils/eip712";

const ORIGINATOR_ROLE = "0x59abfac6520ec36a6556b2a4dd949cc40007459bcd5cd2507f1e5cc77b6bc97e";
const REPAYER_ROLE = "0x9c60024347074fd9de2c1e36003080d22dbc76a41ef87444d21e361bcb39118e";

//interest rate parameters
const INTEREST_DENOMINATOR = ethers.utils.parseEther("1"); //1*10**18
const BASIS_POINTS_DENOMINATOR = BigNumber.from(10000);

interface TestContext {
    loanCoreV2: LoanCoreV2;
    mockERC20: MockERC20;
    borrowerNote: PromissoryNote;
    lenderNote: PromissoryNote;
    assetWrapper: AssetWrapper;
    repaymentControllerV2: RepaymentControllerV2;
    originationController: OriginationController;
    borrower: SignerWithAddress;
    lender: SignerWithAddress;
    admin: SignerWithAddress;
}

describe("Implementation", () => {
    const blockchainTime = new BlockchainTime();

    /**
     * Sets up a test context, deploying new contracts and returning them for use in a test
     */
    const fixture = async (): Promise<TestContext> => {
        const signers: SignerWithAddress[] = await hre.ethers.getSigners();
        const [borrower, lender, admin] = signers;

        const assetWrapper = <AssetWrapper>await deploy("AssetWrapper", admin, ["AssetWrapper", "MA"]);
        const feeController = <FeeController>await deploy("FeeController", admin, []);
        const loanCoreV2 = <LoanCoreV2>await deploy("LoanCoreV2", admin, [assetWrapper.address, feeController.address]);

        const borrowerNoteAddress = await loanCoreV2.borrowerNote();
        const borrowerNote = <PromissoryNote>(
            (await ethers.getContractFactory("PromissoryNote")).attach(borrowerNoteAddress)
        );

        const lenderNoteAddress = await loanCoreV2.lenderNote();
        const lenderNote = <PromissoryNote>(
            (await ethers.getContractFactory("PromissoryNote")).attach(lenderNoteAddress)
        );

        const mockERC20 = <MockERC20>await deploy("MockERC20", admin, ["Mock ERC20", "MOCK"]);

        const repaymentControllerV2 = <RepaymentControllerV2>(
            await deploy("RepaymentControllerV2", admin, [loanCoreV2.address, borrowerNoteAddress, lenderNoteAddress])
        );
        await repaymentControllerV2.deployed();
        const updateRepaymentControllerPermissions = await loanCoreV2.grantRole(
            REPAYER_ROLE,
            repaymentControllerV2.address,
        );
        await updateRepaymentControllerPermissions.wait();

        const originationController = <OriginationController>(
            await deploy("OriginationController", admin, [loanCoreV2.address, assetWrapper.address])
        );
        await originationController.deployed();
        const updateOriginationControllerPermissions = await loanCoreV2.grantRole(
            ORIGINATOR_ROLE,
            originationController.address,
        );
        await updateOriginationControllerPermissions.wait();

        return {
            loanCoreV2,
            borrowerNote,
            lenderNote,
            assetWrapper,
            repaymentControllerV2,
            originationController,
            mockERC20,
            borrower,
            lender,
            admin,
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
            startDate = 0,
            numInstallments = 0,
        }: Partial<LoanTerms> = {},
    ): LoanTerms => {
        return {
            durationSecs,
            principal,
            interest,
            collateralTokenId,
            payableCurrency,
            startDate,
            numInstallments,
        };
    };

    /**
     * Create a LoanTerms object using the given parameters, or defaults
     */
    const createInstallmentLoanTerms = (
        payableCurrency: string,
        {
            durationSecs = 36000,
            principal = hre.ethers.utils.parseEther("100"),
            interest = hre.ethers.utils.parseEther("1"),
            collateralTokenId = BigNumber.from(1),
            startDate = 1648681478,
            numInstallments = 16,
        }: Partial<LoanTerms> = {},
    ): LoanTerms => {
        return {
            durationSecs,
            principal,
            interest,
            collateralTokenId,
            payableCurrency,
            startDate,
            numInstallments,
        };
    };

    const createWnft = async (assetWrapper: AssetWrapper, user: SignerWithAddress) => {
        const tx = await assetWrapper.initializeBundle(await user.getAddress());
        const receipt = await tx.wait();
        if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
            return receipt.events[0].args.tokenId;
        } else {
            throw new Error("Unable to initialize bundle");
        }
    };

    interface LoanDef {
        loanId: string;
        bundleId: string;
        loanTerms: LoanTerms;
        loanData: LoanData;
    }

    const initializeLoan = async (context: TestContext, terms?: Partial<LoanTerms>): Promise<LoanDef> => {
        const { originationController, mockERC20, assetWrapper, loanCoreV2, lender, borrower } = context;
        const bundleId = terms?.collateralTokenId ?? (await createWnft(assetWrapper, borrower));
        const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
        if (terms) Object.assign(loanTerms, terms);

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
            loanData: await loanCoreV2.getLoan(loanId),
        };
    };

    interface LoanDef {
        loanId: string;
        bundleId: string;
        loanTerms: LoanTerms;
        loanData: LoanData;
    }

    const initializeInstallmentLoan = async (context: TestContext, terms?: Partial<LoanTerms>): Promise<LoanDef> => {
        const { originationController, mockERC20, assetWrapper, loanCoreV2, lender, borrower } = context;
        const bundleId = terms?.collateralTokenId ?? (await createWnft(assetWrapper, borrower));
        const loanTerms = createInstallmentLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
        if (terms) Object.assign(loanTerms, terms);
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
            loanData: await loanCoreV2.getLoan(loanId),
        };
    };

    // *********************** INSTALLMENT TESTS *******************************

    it("Tries to create installment loan type with 0 installments.", async () => {
        const context = await loadFixture(fixture);
        const { repaymentControllerV2, assetWrapper, mockERC20, loanCoreV2, borrower, lender } = context;
        const { loanId, loanTerms, loanData, bundleId } = await initializeLoan(context);

        await mint(mockERC20, borrower, loanTerms.principal.add(loanTerms.interest));
        await mockERC20
            .connect(borrower)
            .approve(repaymentControllerV2.address, loanTerms.principal.add(loanTerms.interest));
        expect(await assetWrapper.ownerOf(bundleId)).to.equal(loanCoreV2.address);

        await expect(
            repaymentControllerV2.connect(borrower).getInstallmentMinPayment(loanData.borrowerNoteId),
        ).to.be.revertedWith("This loan type does not have any installments.");
    });

    it("Create an installment loan with 4 installments periods and a loan duration of 36000. Increase time to the second installment period.", async () => {
        const context = await loadFixture(fixture);
        const { repaymentControllerV2, assetWrapper, mockERC20, loanCoreV2, borrower, lender } = context;
        const { loanId, loanTerms, loanData, bundleId } = await initializeInstallmentLoan(context);

        await blockchainTime.increaseTime(8000);

        const res = await repaymentControllerV2.connect(borrower).getInstallmentMinPayment(loanData.borrowerNoteId);
        console.log("RESULT:  ", res);
    });
});
