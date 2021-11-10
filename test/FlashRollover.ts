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
    RepaymentController,
    LoanCore,
    FlashRollover,
    MockLendingPool,
    MockAddressesProvider,
    MockERC20,
} from "../typechain";
import { deploy } from "./utils/contracts";
import { mint } from "./utils/erc20";
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
        feeController: FeeController;
    };
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
    const fixture = async (): Promise<TestContext> => {
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
                repaymentController,
            };
        };

        const legacyLoanCore = await deployLoanCore();
        const currentLoanCore = await deployLoanCore();

        // Create and fund lending pool
        const lendingPool = <MockLendingPool>await deploy("MockLendingPool", admin, []);
        await mockERC20.connect(admin).mint(lendingPool.address, hre.ethers.utils.parseEther("1000000"));

        const addressesProvider = <MockAddressesProvider>(
            await deploy("MockAddressesProvider", admin, [lendingPool.address])
        );
        const flashRollover = <FlashRollover>await deploy("FlashRollover", admin, [addressesProvider.address]);

        return {
            legacy: legacyLoanCore,
            current: currentLoanCore,
            common: {
                mockERC20,
                assetWrapper,
                lendingPool,
                flashRollover,
                feeController,
            },
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
        await mint(mockERC20, lender, loanTerms.principal.mul(10));

        const { v, r, s } = await createLoanTermsSignature(
            originationController.address,
            "OriginationController",
            loanTerms,
            borrower,
        );

        await mockERC20.connect(lender).approve(originationController.address, loanTerms.principal.mul(10));
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

        beforeEach(async () => {
            ctx = await loadFixture(fixture);
            flashRollover = ctx.common.flashRollover;
        });

        it("should revert for an unknown loan ID", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                current: currentContracts,
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, currentContracts);

            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: currentContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: currentContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover
                    .connect(borrower)
                    .rolloverLoan(contracts, BigNumber.from(loanId).mul(2), loanTerms, v, r, s),
            ).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("should revert if caller is not the borrower", async () => {
            const {
                common: { mockERC20 },
                lender,
                admin,
                current: currentContracts,
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, currentContracts);

            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: currentContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: currentContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(admin).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Rollover: borrower only");
        });

        it("should revert if new loan currency does not match old loan", async () => {
            const { lender, borrower, admin, current: currentContracts } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, currentContracts);

            const otherMockERC20 = <MockERC20>await deploy("MockERC20", admin, ["Mock ERC20", "MOCK"]);
            const loanTerms = createLoanTerms(otherMockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: currentContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: currentContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Currency mismatch");
        });

        it("should revert if new loan collateral token does not match old loan", async () => {
            const {
                common: { mockERC20, assetWrapper },
                lender,
                borrower,
                current: currentContracts,
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

            const contracts = {
                loanCore: currentContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: currentContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Collateral mismatch");
        });

        it("should revert if has not approved flash loan balance", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                current: currentContracts,
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, currentContracts);

            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal: hre.ethers.utils.parseEther("50"),
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: currentContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: currentContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Need borrower to approve balance");
        });

        it("should revert if borrower cannot cover flash loan balance", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                admin,
                current: currentContracts,
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, currentContracts);

            // Drain borrower wallet of token and issue a smaller loan
            await mockERC20.connect(borrower).transfer(admin.address, await mockERC20.balanceOf(borrower.address));
            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal: hre.ethers.utils.parseEther("50"),
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: currentContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: currentContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Borrower cannot pay");
        });

        it("should revert if new loan terms do not match signature", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                current: currentContracts,
            } = ctx;
            const {
                loanId,
                bundleId,
                loanData: { borrowerNoteId },
            } = await createLoan(ctx, currentContracts);
            const { borrowerNote } = currentContracts;

            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                { ...loanTerms, principal: hre.ethers.utils.parseEther("1") },
                lender,
            );

            // Approve withdraw of borrower note
            await borrowerNote.connect(borrower).approve(flashRollover.address, borrowerNoteId);
            await mockERC20.connect(borrower).approve(flashRollover.address, loanTerms.principal.mul(10));

            const contracts = {
                loanCore: currentContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: currentContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Origination: signer not participant");
        });

        it("should issue a new loan and disburse extra funds to the borrower", async () => {
            const {
                common: { mockERC20, assetWrapper, feeController, lendingPool },
                lender,
                borrower,
                current: currentContracts,
            } = ctx;
            const {
                loanId,
                bundleId,
                loanData: { borrowerNoteId },
            } = await createLoan(ctx, currentContracts);
            const { borrowerNote, loanCore, originationController } = currentContracts;

            const principal = hre.ethers.utils.parseEther("200");
            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal,
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            // Approve withdraw of borrower note
            await borrowerNote.connect(borrower).approve(flashRollover.address, borrowerNoteId);

            const contracts = {
                loanCore: currentContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: currentContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            // Should be second loan since contracts are redeployed every test
            const expectedLoanId = 2;

            const initialBalance = await mockERC20.balanceOf(borrower.address);
            await expect(flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s))
                .to.emit(mockERC20, "Transfer")
                .withArgs(lender.address, originationController.address, loanTerms.principal)
                .to.emit(mockERC20, "Transfer")
                .withArgs(originationController.address, loanCore.address, loanTerms.principal)
                .to.emit(loanCore, "LoanCreated")
                .to.emit(loanCore, "LoanStarted")
                .to.emit(flashRollover, "Rollover")
                .withArgs(lender.address, borrower.address, bundleId, expectedLoanId)
                .to.emit(lendingPool, "FlashLoan")
                .withArgs(hre.ethers.utils.parseEther("101"), hre.ethers.utils.parseEther("101").mul(9).div(10_000));

            const loanData = await loanCore.getLoan(expectedLoanId);

            // Check that borrower owns borrower note
            expect(await borrowerNote.ownerOf(loanData.borrowerNoteId)).to.equal(borrower.address);
            // Check that loanCore owns collateral
            expect(await assetWrapper.ownerOf(loanData.terms.collateralTokenId)).to.equal(loanCore.address);
            // Check that borrower received extra principal
            const premiumPaid = hre.ethers.utils.parseEther("101").mul(9).div(10_000);
            const originationFee = await feeController.getOriginationFee();
            const newPrincipal = principal.sub(principal.mul(originationFee).div(10_000));
            const expectedBalance = newPrincipal
                .sub(premiumPaid)
                .add(initialBalance)
                .sub(hre.ethers.utils.parseEther("101"));
            expect(await mockERC20.balanceOf(borrower.address)).to.equal(expectedBalance);
        });

        it("should issue a new loan and withdraw needed funds from the borrower", async () => {
            const {
                common: { mockERC20, assetWrapper, feeController, lendingPool },
                lender,
                borrower,
                current: currentContracts,
            } = ctx;
            const {
                loanId,
                bundleId,
                loanData: { borrowerNoteId },
            } = await createLoan(ctx, currentContracts);
            const { borrowerNote, loanCore, originationController } = currentContracts;

            const principal = hre.ethers.utils.parseEther("50");
            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal,
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            // Approve withdraw of borrower note and funds to repay old loan
            await borrowerNote.connect(borrower).approve(flashRollover.address, borrowerNoteId);
            await mockERC20.connect(borrower).approve(flashRollover.address, loanTerms.principal.mul(10));

            const contracts = {
                loanCore: currentContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: currentContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            // Should be second loan since contracts are redeployed every test
            const expectedLoanId = 2;

            const initialBalance = await mockERC20.balanceOf(borrower.address);
            await expect(flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s))
                .to.emit(mockERC20, "Transfer")
                .withArgs(lender.address, originationController.address, loanTerms.principal)
                .to.emit(mockERC20, "Transfer")
                .withArgs(originationController.address, loanCore.address, loanTerms.principal)
                .to.emit(loanCore, "LoanCreated")
                .to.emit(loanCore, "LoanStarted")
                .to.emit(flashRollover, "Rollover")
                .withArgs(lender.address, borrower.address, bundleId, expectedLoanId)
                .to.emit(lendingPool, "FlashLoan")
                .withArgs(hre.ethers.utils.parseEther("101"), hre.ethers.utils.parseEther("101").mul(9).div(10_000));

            const loanData = await loanCore.getLoan(expectedLoanId);

            // Check that borrower owns borrower note
            expect(await borrowerNote.ownerOf(loanData.borrowerNoteId)).to.equal(borrower.address);
            // Check that loanCore owns collateral
            expect(await assetWrapper.ownerOf(loanData.terms.collateralTokenId)).to.equal(loanCore.address);
            // Check that borrower balance was deducted
            const premiumPaid = hre.ethers.utils.parseEther("101").mul(9).div(10_000);
            const originationFee = await feeController.getOriginationFee();
            const newPrincipal = principal.sub(principal.mul(originationFee).div(10_000));
            const expectedBalance = newPrincipal
                .sub(premiumPaid)
                .add(initialBalance)
                .sub(hre.ethers.utils.parseEther("101"));
            expect(await mockERC20.balanceOf(borrower.address)).to.equal(expectedBalance);
        });

        it("gas [ @skip-on-coverage ]", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                current: currentContracts,
            } = ctx;
            const {
                loanId,
                bundleId,
                loanData: { borrowerNoteId },
            } = await createLoan(ctx, currentContracts);
            const { borrowerNote } = currentContracts;

            const principal = hre.ethers.utils.parseEther("50");
            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal,
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            // Approve withdraw of borrower note and funds to repay old loan
            await borrowerNote.connect(borrower).approve(flashRollover.address, borrowerNoteId);
            await mockERC20.connect(borrower).approve(flashRollover.address, loanTerms.principal.mul(10));

            const contracts = {
                loanCore: currentContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: currentContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            const tx = await flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s);
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed;
            expect(gasUsed.toString()).to.equal("884133");
        });
    });

    describe("Legacy Loan Rollover (Migration) ", () => {
        let ctx: TestContext;
        let flashRollover: FlashRollover;

        beforeEach(async () => {
            ctx = await loadFixture(fixture);
            flashRollover = ctx.common.flashRollover;
        });

        it("should revert for an unknown loan ID", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                current: currentContracts,
                legacy: legacyContracts,
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, legacyContracts);

            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover
                    .connect(borrower)
                    .rolloverLoan(contracts, BigNumber.from(loanId).mul(2), loanTerms, v, r, s),
            ).to.be.revertedWith("ERC721: owner query for nonexistent token");
        });

        it("should revert if caller is not the borrower", async () => {
            const {
                common: { mockERC20 },
                lender,
                admin,
                current: currentContracts,
                legacy: legacyContracts,
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, legacyContracts);

            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(admin).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Rollover: borrower only");
        });

        it("should revert if new loan currency does not match old loan", async () => {
            const { lender, borrower, admin, current: currentContracts, legacy: legacyContracts } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, legacyContracts);

            const otherMockERC20 = <MockERC20>await deploy("MockERC20", admin, ["Mock ERC20", "MOCK"]);
            const loanTerms = createLoanTerms(otherMockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Currency mismatch");
        });

        it("should revert if target loanCore does not use same AssetWrapper", async () => {
            const {
                common: { feeController, mockERC20 },
                borrower,
                lender,
                admin,
                legacy: legacyContracts
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, legacyContracts);

            const assetWrapper2 = <AssetWrapper>await deploy("AssetWrapper", admin, ["AssetWrapper", "MA"]);
            const newLoanCore = <LoanCore>await deploy("LoanCore", admin, [assetWrapper2.address, feeController.address]);
            const newOriginationController = <OriginationController>(
                await deploy("OriginationController", admin, [newLoanCore.address, assetWrapper2.address])
            );
            await newOriginationController.deployed();
            const updateOriginationControllerPermissions = await newLoanCore.grantRole(
                ORIGINATOR_ROLE,
                newOriginationController.address,
            );
            await updateOriginationControllerPermissions.wait();

            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal: hre.ethers.utils.parseEther("50"),
            });

            const { v, r, s } = await createLoanTermsSignature(
                newOriginationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: newLoanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: newOriginationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Non-compatible AssetWrapper");
        });

        it("should revert if new loan collateral token does not match old loan", async () => {
            const {
                common: { mockERC20, assetWrapper },
                lender,
                borrower,
                current: currentContracts,
                legacy: legacyContracts,
            } = ctx;
            const { loanId } = await createLoan(ctx, legacyContracts);

            const otherBundleId = await createWnft(assetWrapper, borrower);
            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: otherBundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Collateral mismatch");
        });

        it("should revert if borrower has not approved flash loan balance", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                current: currentContracts,
                legacy: legacyContracts,
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, legacyContracts);

            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal: hre.ethers.utils.parseEther("50"),
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Need borrower to approve balance");
        });

        it("should revert if borrower cannot cover flash loan balance", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                admin,
                current: currentContracts,
                legacy: legacyContracts,
            } = ctx;
            const { loanId, bundleId } = await createLoan(ctx, legacyContracts);

            // Drain borrower wallet of token and issue a smaller loan
            await mockERC20.connect(borrower).transfer(admin.address, await mockERC20.balanceOf(borrower.address));
            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal: hre.ethers.utils.parseEther("50"),
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Borrower cannot pay");
        });

        it("should revert if new loan terms do not match signature", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                current: currentContracts,
                legacy: legacyContracts,
            } = ctx;
            const {
                loanId,
                bundleId,
                loanData: { borrowerNoteId },
            } = await createLoan(ctx, legacyContracts);
            const { borrowerNote } = legacyContracts;

            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                { ...loanTerms, principal: hre.ethers.utils.parseEther("1") },
                lender,
            );

            // Approve withdraw of borrower note
            await borrowerNote.connect(borrower).approve(flashRollover.address, borrowerNoteId);
            await mockERC20.connect(borrower).approve(flashRollover.address, loanTerms.principal.mul(10));

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            await expect(
                flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s),
            ).to.be.revertedWith("Origination: signer not participant");
        });

        it("should issue a new loan and disburse extra funds to the borrower", async () => {
            const {
                common: { mockERC20, assetWrapper, feeController, lendingPool },
                lender,
                borrower,
                current: currentContracts,
                legacy: legacyContracts,
            } = ctx;
            const {
                loanId,
                bundleId,
                loanData: { borrowerNoteId },
            } = await createLoan(ctx, legacyContracts);
            const { loanCore, originationController, borrowerNote: newBorrowerNote } = currentContracts;
            const { borrowerNote } = legacyContracts;

            const principal = hre.ethers.utils.parseEther("200");
            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal,
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            // Approve withdraw of borrower note and new funds
            await borrowerNote.connect(borrower).approve(flashRollover.address, borrowerNoteId);
            await mockERC20.connect(lender).approve(originationController.address, loanTerms.principal.mul(10));

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            // Should be first loan on new loancore since contracts are redeployed every test
            const expectedLoanId = 1;

            const initialBalance = await mockERC20.balanceOf(borrower.address);
            await expect(flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s))
                .to.emit(mockERC20, "Transfer")
                .withArgs(lender.address, originationController.address, loanTerms.principal)
                .to.emit(mockERC20, "Transfer")
                .withArgs(originationController.address, loanCore.address, loanTerms.principal)
                .to.emit(loanCore, "LoanCreated")
                .to.emit(loanCore, "LoanStarted")
                .to.emit(flashRollover, "Rollover")
                .withArgs(lender.address, borrower.address, bundleId, expectedLoanId)
                .to.emit(flashRollover, "Migration")
                .withArgs(legacyContracts.loanCore.address, currentContracts.loanCore.address, expectedLoanId)
                .to.emit(lendingPool, "FlashLoan")
                .withArgs(hre.ethers.utils.parseEther("101"), hre.ethers.utils.parseEther("101").mul(9).div(10_000));

            const loanData = await loanCore.getLoan(expectedLoanId);

            // Check that borrower owns borrower note
            expect(await newBorrowerNote.ownerOf(loanData.borrowerNoteId)).to.equal(borrower.address);
            // Check that loanCore owns collateral
            expect(await assetWrapper.ownerOf(loanData.terms.collateralTokenId)).to.equal(loanCore.address);
            // Check that borrower received extra principal
            const premiumPaid = hre.ethers.utils.parseEther("101").mul(9).div(10_000);
            const originationFee = await feeController.getOriginationFee();
            const newPrincipal = principal.sub(principal.mul(originationFee).div(10_000));
            const expectedBalance = newPrincipal
                .sub(premiumPaid)
                .add(initialBalance)
                .sub(hre.ethers.utils.parseEther("101"));
            expect(await mockERC20.balanceOf(borrower.address)).to.equal(expectedBalance);
        });

        it("should issue a new loan and withdraw needed funds from the borrower", async () => {
            const {
                common: { mockERC20, assetWrapper, feeController, lendingPool },
                lender,
                borrower,
                current: currentContracts,
                legacy: legacyContracts,
            } = ctx;
            const {
                loanId,
                bundleId,
                loanData: { borrowerNoteId },
            } = await createLoan(ctx, legacyContracts);
            const { loanCore, originationController, borrowerNote: newBorrowerNote } = currentContracts;
            const { borrowerNote } = legacyContracts;

            const principal = hre.ethers.utils.parseEther("50");
            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal,
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            // Approve withdraw of borrower note and funds to repay old loan
            await borrowerNote.connect(borrower).approve(flashRollover.address, borrowerNoteId);
            await mockERC20.connect(borrower).approve(flashRollover.address, loanTerms.principal.mul(10));
            await mockERC20.connect(lender).approve(originationController.address, loanTerms.principal.mul(10));

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            // Should be first loan on new loancore since contracts are redeployed every test
            const expectedLoanId = 1;

            const initialBalance = await mockERC20.balanceOf(borrower.address);
            await expect(flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s))
                .to.emit(mockERC20, "Transfer")
                .withArgs(lender.address, originationController.address, loanTerms.principal)
                .to.emit(mockERC20, "Transfer")
                .withArgs(originationController.address, loanCore.address, loanTerms.principal)
                .to.emit(loanCore, "LoanCreated")
                .to.emit(loanCore, "LoanStarted")
                .to.emit(flashRollover, "Rollover")
                .withArgs(lender.address, borrower.address, bundleId, expectedLoanId)
                .to.emit(lendingPool, "FlashLoan")
                .withArgs(hre.ethers.utils.parseEther("101"), hre.ethers.utils.parseEther("101").mul(9).div(10_000));

            const loanData = await loanCore.getLoan(expectedLoanId);

            // Check that borrower owns borrower note
            expect(await newBorrowerNote.ownerOf(loanData.borrowerNoteId)).to.equal(borrower.address);
            // Check that loanCore owns collateral
            expect(await assetWrapper.ownerOf(loanData.terms.collateralTokenId)).to.equal(loanCore.address);
            // Check that borrower balance was deducted
            const premiumPaid = hre.ethers.utils.parseEther("101").mul(9).div(10_000);
            const originationFee = await feeController.getOriginationFee();
            const newPrincipal = principal.sub(principal.mul(originationFee).div(10_000));
            const expectedBalance = newPrincipal
                .sub(premiumPaid)
                .add(initialBalance)
                .sub(hre.ethers.utils.parseEther("101"));
            expect(await mockERC20.balanceOf(borrower.address)).to.equal(expectedBalance);
        });

        it("gas [ @skip-on-coverage ]", async () => {
            const {
                common: { mockERC20 },
                lender,
                borrower,
                current: currentContracts,
                legacy: legacyContracts,
            } = ctx;
            const {
                loanId,
                bundleId,
                loanData: { borrowerNoteId },
            } = await createLoan(ctx, legacyContracts);
            const { originationController } = currentContracts;
            const { borrowerNote } = legacyContracts;

            const principal = hre.ethers.utils.parseEther("50");
            const loanTerms = createLoanTerms(mockERC20.address, {
                collateralTokenId: bundleId,
                principal,
            });
            const { v, r, s } = await createLoanTermsSignature(
                currentContracts.originationController.address,
                "OriginationController",
                loanTerms,
                lender,
            );

            // Approve withdraw of borrower note and funds to repay old loan
            await borrowerNote.connect(borrower).approve(flashRollover.address, borrowerNoteId);
            await mockERC20.connect(borrower).approve(flashRollover.address, loanTerms.principal.mul(10));
            await mockERC20.connect(lender).approve(originationController.address, loanTerms.principal.mul(10));

            const contracts = {
                loanCore: legacyContracts.loanCore.address,
                targetLoanCore: currentContracts.loanCore.address,
                repaymentController: legacyContracts.repaymentController.address,
                originationController: currentContracts.originationController.address,
            };

            const tx = await flashRollover.connect(borrower).rolloverLoan(contracts, loanId, loanTerms, v, r, s);
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed;
            expect(gasUsed.toString()).to.equal("1095375");
        });
    });
});
