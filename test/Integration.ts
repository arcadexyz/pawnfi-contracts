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
  MockERC20,
} from "../typechain";
import { BlockchainTime } from "./utils/time";
import { deploy } from "./utils/contracts";
import { approve, mint } from "./utils/erc20";
import { LoanTerms, LoanData } from "./utils/types";
import { createLoanTermsSignature } from "./utils/eip712";

const ORIGINATOR_ROLE = "0x59abfac6520ec36a6556b2a4dd949cc40007459bcd5cd2507f1e5cc77b6bc97e";
const REPAYER_ROLE = "0x9c60024347074fd9de2c1e36003080d22dbc76a41ef87444d21e361bcb39118e";

interface TestContext {
  loanCore: LoanCore;
  mockERC20: MockERC20;
  borrowerNote: PromissoryNote;
  lenderNote: PromissoryNote;
  assetWrapper: AssetWrapper;
  repaymentController: RepaymentController;
  originationController: OriginationController;
  borrower: SignerWithAddress;
  lender: SignerWithAddress;
  admin: SignerWithAddress;
}

describe("Integration", () => {
  const blockchainTime = new BlockchainTime();

  /**
   * Sets up a test context, deploying new contracts and returning them for use in a test
   */
  const setupTestContext = async (): Promise<TestContext> => {
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();
    const [borrower, lender, admin] = signers;

    const assetWrapper = <AssetWrapper>await deploy("AssetWrapper", admin, ["AssetWrapper", "MA"]);
    const feeController = <FeeController>await deploy("FeeController", admin, []);
    const loanCore = <LoanCore>await deploy("LoanCore", admin, [assetWrapper.address, feeController.address]);

    const borrowerNoteAddress = await loanCore.borrowerNote();
    const borrowerNote = <PromissoryNote>(
      (await ethers.getContractFactory("PromissoryNote")).attach(borrowerNoteAddress)
    );

    const lenderNoteAddress = await loanCore.lenderNote();
    const lenderNote = <PromissoryNote>(await ethers.getContractFactory("PromissoryNote")).attach(lenderNoteAddress);

    const mockERC20 = <MockERC20>await deploy("MockERC20", admin, ["Mock ERC20", "MOCK"]);

    const repaymentController = <RepaymentController>(
      await deploy("RepaymentController", admin, [loanCore.address, borrowerNoteAddress, lenderNoteAddress])
    );
    await repaymentController.deployed();
    const updateRepaymentControllerPermissions = await loanCore.grantRole(REPAYER_ROLE, repaymentController.address);
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
      assetWrapper,
      repaymentController,
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
      dueDate = new Date(new Date().getTime() + 3600000).getTime(),
      principal = hre.ethers.utils.parseEther("100"),
      interest = hre.ethers.utils.parseEther("1"),
      collateralTokenId = BigNumber.from(1),
    }: Partial<LoanTerms> = {},
  ): LoanTerms => {
    return {
      dueDate,
      principal,
      interest,
      collateralTokenId,
      payableCurrency,
    };
  };

  const createCnft = async (assetWrapper: AssetWrapper, user: SignerWithAddress) => {
    const tx = await assetWrapper.initializeBundle(await user.getAddress());
    const receipt = await tx.wait();
    if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
      return receipt.events[0].args.tokenId;
    } else {
      throw new Error("Unable to initialize bundle");
    }
  };

  describe("Originate Loan", function () {
    it("should successfully create a loan", async () => {
      const { originationController, mockERC20, loanCore, assetWrapper, lender, borrower } = await setupTestContext();

      const bundleId = await createCnft(assetWrapper, borrower);
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
      await expect(
        originationController
          .connect(lender)
          .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s),
      )
        .to.emit(mockERC20, "Transfer")
        .withArgs(await lender.getAddress(), loanCore.address, loanTerms.principal)
        .to.emit(loanCore, "LoanCreated")
        .to.emit(loanCore, "LoanStarted");
    });

    it("should fail to start loan if cNFT is withdrawn", async () => {
      const { originationController, mockERC20, assetWrapper, lender, borrower } = await setupTestContext();

      const bundleId = await createCnft(assetWrapper, borrower);
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
      // simulate someone trying to withdraw just before initializing the loan
      await assetWrapper.connect(borrower).withdraw(bundleId);
      await expect(
        originationController
          .connect(lender)
          .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s),
      ).to.be.revertedWith("ERC721: operator query for nonexistent token");
    });

    it("should fail to create a loan with nonexistent collateral", async () => {
      const { originationController, mockERC20, lender, borrower } = await setupTestContext();

      const bundleId = BigNumber.from(25);
      const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
      await mint(mockERC20, lender, loanTerms.principal);

      const { v, r, s } = await createLoanTermsSignature(
        originationController.address,
        "OriginationController",
        loanTerms,
        borrower,
      );

      await approve(mockERC20, lender, originationController.address, loanTerms.principal);
      await expect(
        originationController
          .connect(lender)
          .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s),
      ).to.be.revertedWith("ERC721: operator query for nonexistent token");
    });

    it("should fail to create a loan with passed due date", async () => {
      const { originationController, mockERC20, assetWrapper, lender, borrower } = await setupTestContext();

      const bundleId = await createCnft(assetWrapper, borrower);
      const loanTerms = createLoanTerms(mockERC20.address, {
        collateralTokenId: bundleId,
        dueDate: await blockchainTime.secondsFromNow(-1000),
      });
      await mint(mockERC20, lender, loanTerms.principal);

      const { v, r, s } = await createLoanTermsSignature(
        originationController.address,
        "OriginationController",
        loanTerms,
        borrower,
      );

      await approve(mockERC20, lender, originationController.address, loanTerms.principal);
      await assetWrapper.connect(borrower).approve(originationController.address, bundleId);
      await expect(
        originationController
          .connect(lender)
          .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s),
      ).to.be.revertedWith("LoanCore::create: Loan is already expired");
    });
  });

  describe("Repay Loan", function () {
    interface LoanDef {
      loanId: string;
      bundleId: string;
      loanTerms: LoanTerms;
      loanData: LoanData;
    }

    const initializeLoan = async (context: TestContext): Promise<LoanDef> => {
      const { originationController, mockERC20, assetWrapper, loanCore, lender, borrower } = context;
      const bundleId = await createCnft(assetWrapper, borrower);
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
      if (receipt && receipt.events && receipt.events.length === 9) {
        const LoanCreatedLog = new hre.ethers.utils.Interface([
          "event LoanStarted(uint256 loanId, address lender, address borrower)",
        ]);
        const log = LoanCreatedLog.parseLog(receipt.events[8]);
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

    it("should successfully repay loan", async () => {
      const context = await setupTestContext();
      const { repaymentController, assetWrapper, mockERC20, loanCore, borrower, lender } = context;
      const { loanId, loanTerms, loanData, bundleId } = await initializeLoan(context);

      await mint(mockERC20, borrower, loanTerms.principal.add(loanTerms.interest));
      await mockERC20
        .connect(borrower)
        .approve(repaymentController.address, loanTerms.principal.add(loanTerms.interest));

      // pre-repaid state
      expect(await assetWrapper.ownerOf(bundleId)).to.equal(loanCore.address);
      const preLenderBalance = await mockERC20.balanceOf(await lender.getAddress());

      await expect(repaymentController.connect(borrower).repay(loanData.borrowerNoteId))
        .to.emit(loanCore, "LoanRepaid")
        .withArgs(loanId);

      // post-repaid state
      expect(await assetWrapper.ownerOf(bundleId)).to.equal(await borrower.getAddress());
      const postLenderBalance = await mockERC20.balanceOf(await lender.getAddress());
      expect(postLenderBalance.sub(preLenderBalance)).to.equal(loanTerms.principal.add(loanTerms.interest));
    });

    it("fails if payable currency is not approved", async () => {
      const context = await setupTestContext();
      const { repaymentController, mockERC20, borrower } = context;
      const { loanTerms, loanData } = await initializeLoan(context);

      await mint(mockERC20, borrower, loanTerms.principal.add(loanTerms.interest));

      await expect(repaymentController.connect(borrower).repay(loanData.borrowerNoteId)).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance",
      );
    });

    it("fails with invalid note ID", async () => {
      const context = await setupTestContext();
      const { repaymentController, mockERC20, borrower } = context;
      const { loanTerms } = await initializeLoan(context);

      await mint(mockERC20, borrower, loanTerms.principal.add(loanTerms.interest));
      await mockERC20
        .connect(borrower)
        .approve(repaymentController.address, loanTerms.principal.add(loanTerms.interest));

      await expect(repaymentController.connect(borrower).repay(1234)).to.be.revertedWith(
        "RepaymentController: repay could not dereference loan",
      );
    });
  });

  describe("Claim loan", function () {
    interface LoanDef {
      loanId: string;
      bundleId: string;
      loanTerms: LoanTerms;
      loanData: LoanData;
    }

    const initializeLoan = async (context: TestContext): Promise<LoanDef> => {
      const { originationController, mockERC20, assetWrapper, loanCore, lender, borrower } = context;
      const dueDate = await blockchainTime.secondsFromNow(1000);
      const bundleId = await createCnft(assetWrapper, borrower);
      const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId, dueDate });
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
      if (receipt && receipt.events && receipt.events.length === 9) {
        const LoanCreatedLog = new hre.ethers.utils.Interface([
          "event LoanStarted(uint256 loanId, address lender, address borrower)",
        ]);
        const log = LoanCreatedLog.parseLog(receipt.events[8]);
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

    it("should successfully claim loan", async () => {
      const context = await setupTestContext();
      const { repaymentController, assetWrapper, loanCore, lender } = context;
      const { loanId, loanData, bundleId } = await initializeLoan(context);

      // pre-repaid state
      expect(await assetWrapper.ownerOf(bundleId)).to.equal(loanCore.address);
      await blockchainTime.increaseTime(5000);

      await expect(repaymentController.connect(lender).claim(loanData.lenderNoteId))
        .to.emit(loanCore, "LoanClaimed")
        .withArgs(loanId);

      // post-repaid state
      expect(await assetWrapper.ownerOf(bundleId)).to.equal(await lender.getAddress());
    });

    it("fails if not past dueDate", async () => {
      const context = await setupTestContext();
      const { repaymentController, lender } = context;
      const { loanData } = await initializeLoan(context);

      await expect(repaymentController.connect(lender).claim(loanData.lenderNoteId)).to.be.revertedWith(
        "LoanCore::claim: Loan not expired",
      );
    });

    it("fails for invalid noteId", async () => {
      const context = await setupTestContext();
      const { repaymentController, lender } = context;

      await blockchainTime.increaseTime(5000);
      await expect(repaymentController.connect(lender).claim(1234)).to.be.revertedWith(
        "ERC721: owner query for nonexistent token",
      );
    });

    it("fails if not called by lender", async () => {
      const context = await setupTestContext();
      const { repaymentController, borrower } = context;
      const { loanData } = await initializeLoan(context);

      await blockchainTime.increaseTime(5000);
      await expect(repaymentController.connect(borrower).claim(loanData.lenderNoteId)).to.be.revertedWith(
        "RepaymentController: not owner of lender note",
      );
    });
  });
});
