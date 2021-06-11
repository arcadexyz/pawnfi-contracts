import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { utils, Signer } from "ethers";

import { MockLoanCore, MockERC20, MockERC721, RepaymentController } from "../typechain";
import { deploy } from "./utils/contracts";

interface TestContext {
  loanId: string;
  loanData: any;
  repaymentController: RepaymentController;
  mockERC20: MockERC20;
  mockLoanCore: MockLoanCore;
  borrower: Signer;
  lender: Signer;
  otherParty: Signer;
  signers: Signer[];
}

describe("RepaymentController", () => {
  const TEST_LOAN_PRINCIPAL = 10;
  const TEST_LOAN_INTEREST = 1;
  let context: TestContext;

  /**
   * Sets up a test context, deploying new contracts and returning them for use in a test
   */
  const setupTestContext = async (): Promise<TestContext> => {
    const signers: Signer[] = await hre.ethers.getSigners();
    const [deployer, borrower, lender, otherParty] = signers;

    const mockCollateral = <MockERC721>await deploy("MockERC721", deployer, ["Mock Collateral", "McNFT"]);
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

    const repaymentController = <RepaymentController>(
      await deploy("RepaymentController", deployer, [mockLoanCore.address, borrowerNoteAddress, lenderNoteAddress])
    );

    // Mint collateral token from asset wrapper
    const collateralMintTx = await mockCollateral.mint(await borrower.getAddress());
    await collateralMintTx.wait();

    // token Id is 0 since it's the first one minted
    const collateralTokenId = 0;

    const dueDate = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14;
    const terms = {
      dueDate: dueDate,
      principal: utils.parseEther(TEST_LOAN_PRINCIPAL.toString()),
      interest: utils.parseEther(TEST_LOAN_INTEREST.toString()),
      collateralTokenId,
      payableCurrency: mockERC20.address,
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

    const loanData = await mockLoanCore.getLoan(loanId);

    return {
      loanId,
      loanData,
      repaymentController,
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
      context = await setupTestContext();
    });

    it("reverts for an invalid note ID", async () => {
      const { repaymentController, borrower } = context;
      // Use junk note ID, like 1000
      await expect(repaymentController.connect(borrower).repay(1000)).to.be.revertedWith(
        "RepaymentController: repay could not dereference loan",
      );
    });

    it("repays the loan and withdraws from the borrower's account", async () => {
      const { mockERC20, borrower, repaymentController, loanData } = context;

      const balanceBefore = await mockERC20.balanceOf(await borrower.getAddress());
      expect(balanceBefore.eq(utils.parseEther((TEST_LOAN_PRINCIPAL + TEST_LOAN_INTEREST).toString())));

      // approve withdrawal
      await mockERC20.connect(borrower).approve(repaymentController.address, utils.parseEther("100"));
      await repaymentController.connect(borrower).repay(loanData.borrowerNoteId);

      // Test that borrower no longer has funds
      const balanceAfter = await mockERC20.balanceOf(await borrower.getAddress());
      expect(balanceAfter.eq(0));

      // Correct loan state update should be tested in LoanCore
    });

    it("allows any party to repay the loan, even if not the borrower", async () => {
      const { mockERC20, otherParty, repaymentController, loanData } = context;

      const balanceBefore = await mockERC20.balanceOf(await otherParty.getAddress());
      expect(balanceBefore.eq(utils.parseEther((TEST_LOAN_PRINCIPAL + TEST_LOAN_INTEREST).toString())));

      await mockERC20.connect(otherParty).approve(repaymentController.address, utils.parseEther("100"));
      await repaymentController.connect(otherParty).repay(loanData.borrowerNoteId);

      // Test that otherParty no longer has funds
      const balanceAfter = await mockERC20.balanceOf(await otherParty.getAddress());
      expect(balanceAfter.eq(0));

      // Correct loan state update should be tested in LoanCore
    });
  });
  describe("claim", () => {
    beforeEach(async () => {
      context = await setupTestContext();
    });

    it("reverts for an invalid note ID", async () => {
      const { repaymentController, lender } = context;

      // Use junk note ID, like 1000
      await expect(repaymentController.connect(lender).claim(1000)).to.be.revertedWith(
        "ERC721: owner query for nonexistent token",
      );
    });

    it("reverts for a note ID not owned by caller", async () => {
      const { repaymentController, lender, borrower, mockLoanCore, loanData } = context;

      const lenderNote = await (await ethers.getContractFactory("PromissoryNote")).attach(
        await mockLoanCore.lenderNote(),
      );
      await lenderNote
        .connect(lender)
        .transferFrom(await lender.getAddress(), await borrower.getAddress(), loanData.lenderNoteId);

      // Use junk note ID, like 1000
      await expect(repaymentController.connect(lender).claim(loanData.lenderNoteId)).to.be.revertedWith(
        "RepaymentController: not owner of lender note",
      );
    });

    it("reverts if the claimant is not the lender", async () => {
      const { repaymentController, borrower, loanData } = context;

      // Attempt to claim note from the borrower account
      await expect(repaymentController.connect(borrower).claim(loanData.lenderNoteId)).to.be.revertedWith(
        "RepaymentController: not owner of lender note",
      );
    });

    it("claims the collateral and sends it to the lender's account", async () => {
      const { repaymentController, lender, loanData } = context;

      await repaymentController.connect(lender).claim(loanData.lenderNoteId);

      // Not reverted - correct loan state and disbursement should be updated in LoanCore
    });
  });
});
