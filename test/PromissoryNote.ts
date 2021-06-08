import { expect } from "chai";
import hre from "hardhat";
import { BigNumber, BigNumberish, Signer } from "ethers";
import { MockLoanCore, MockERC721, PromissoryNote } from "../typechain";
import { deploy } from "./utils/contracts";

enum LoanState {
  DUMMY = 0,
  Created = 1,
  Active = 2,
  Repaid = 3,
  Defaulted = 4,
}

interface TestContext {
  borrowerPromissoryNote: PromissoryNote;
  lenderPromissoryNote: PromissoryNote;
  loanCore: MockLoanCore;
  mockAssetWrapper: MockERC721;
  user: Signer;
  other: Signer;
  signers: Signer[];
}

interface LoanTerms {
  dueDate: BigNumberish;
  principal: BigNumber;
  interest: BigNumber;
  collateralTokenId: BigNumber;
  payableCurrency: string;
}

describe("PromissoryNote", () => {
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

  const setupTestContext = async (): Promise<TestContext> => {
    const signers: Signer[] = await hre.ethers.getSigners();
    const mockAssetWrapper = <MockERC721>await deploy("MockERC721", signers[0], ["Mock AssetWrapper", "MA"]);
    const loanCore = <MockLoanCore>await deploy("MockLoanCore", signers[0], []);
    const lenderPromissoryNote = <PromissoryNote>(
      await deploy("PromissoryNote", signers[0], ["PromissoryNote - Lender", "PBL"])
    );
    const borrowerPromissoryNote = <PromissoryNote>(
      await deploy("PromissoryNote", signers[0], ["PromissoryNote - Borrower", "PBNs"])
    );

    return {
      borrowerPromissoryNote,
      lenderPromissoryNote,
      loanCore,
      mockAssetWrapper,
      user: signers[0],
      other: signers[1],
      signers: signers.slice(2),
    };
  };

  const createLoan = async (loanCore: MockLoanCore, user: Signer, terms: LoanTerms): Promise<BigNumber> => {
    const transaction = await loanCore.connect(user).createLoan(terms);
    const receipt = await transaction.wait();

    if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
      return receipt.events[0].args.loanId;
    } else {
      throw new Error("Unable to initialize loan");
    }
  };

  const startLoan = async (
    loanCore: MockLoanCore,
    user: Signer,
    lenderNote: PromissoryNote,
    borrowerNote: PromissoryNote,
    loanId: BigNumber,
  ) => {
    const transaction = await loanCore.connect(user).startLoan(lenderNote.address, borrowerNote.address, loanId);
    await transaction.wait();
  };

  const repayLoan = async (loanCore: MockLoanCore, user: Signer, loanId: BigNumber) => {
    const transaction = await loanCore.connect(user).repay(loanId);
    await transaction.wait();
  };

  const mintPromissoryNote = async (note: PromissoryNote, user: Signer): Promise<BigNumber> => {
    const transaction = await note.mint(await user.getAddress());
    const receipt = await transaction.wait();

    if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
      return receipt.events[0].args.tokenId;
    } else {
      throw new Error("Unable to mint promissory note");
    }
  };

  describe("constructor", () => {
    it("Creates a PromissoryNote", async () => {
      const signers: Signer[] = await hre.ethers.getSigners();

      const PromissoryNote = <PromissoryNote>await deploy("PromissoryNote", signers[0], ["PromissoryNote", "BN"]);

      expect(PromissoryNote).exist;
    });
  });

  describe("mint", () => {
    it("Reverts if sender is not loanCore", async () => {
      const { lenderPromissoryNote: promissoryNote, user, other } = await setupTestContext();
      const transaction = promissoryNote.connect(other).mint(await user.getAddress());
      await expect(transaction).to.be.reverted;
    });

    it("Assigns a PromissoryNote NFT to the recipient", async () => {
      const { lenderPromissoryNote: promissoryNote, user, other } = await setupTestContext();
      const transaction = await promissoryNote.connect(user).mint(await other.getAddress());
      const receipt = await transaction.wait();

      if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
        return expect(receipt.events[0]).exist;
      } else {
        throw new Error("Unable to mint promissory note");
      }
    });
  });

  describe("burn", () => {
    it("Reverts if sender does not own the note", async () => {
      const {
        borrowerPromissoryNote: promissoryNote,
        lenderPromissoryNote,
        loanCore,
        mockAssetWrapper,
        user,
        other,
      } = await setupTestContext();
      const loanTerms = createLoanTerms(mockAssetWrapper.address);
      const promissoryNoteId = await mintPromissoryNote(promissoryNote, user);
      const loanId = await createLoan(loanCore, user, loanTerms);
      await startLoan(loanCore, user, lenderPromissoryNote, promissoryNote, loanId);
      const loanData = await loanCore.connect(user).getLoan(loanId);
      expect(loanData.state).to.equal(LoanState.Active);
      await repayLoan(loanCore, user, loanId);
      const loanDataAfterRepay = await loanCore.connect(user).getLoan(loanId);
      expect(loanDataAfterRepay.state).to.equal(LoanState.Repaid);
      await expect(promissoryNote.connect(other).burn(promissoryNoteId)).to.be.reverted;
    });

    it("Burns a PromissoryNote NFT", async () => {
      const {
        borrowerPromissoryNote: promissoryNote,
        lenderPromissoryNote,
        loanCore,
        mockAssetWrapper,
        user,
      } = await setupTestContext();
      const promissoryNoteId = await mintPromissoryNote(promissoryNote, user);
      const loanTerms = createLoanTerms(mockAssetWrapper.address);
      const loanId = await createLoan(loanCore, user, loanTerms);
      await startLoan(loanCore, user, lenderPromissoryNote, promissoryNote, loanId);
      const loanData = await loanCore.connect(user).getLoan(loanId);
      expect(loanData.state).to.equal(LoanState.Active);
      await repayLoan(loanCore, user, loanId);
      const loanDataAfterRepay = await loanCore.connect(user).getLoan(loanId);
      expect(loanDataAfterRepay.state).to.equal(LoanState.Repaid);
      expect(promissoryNote.connect(user).burn(promissoryNoteId));
    });
  });
});
