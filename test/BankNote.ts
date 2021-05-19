import { expect } from "chai";
import hre from "hardhat";
import { BigNumber, BigNumberish, Signer } from "ethers";
import { MockLoanCore, MockERC721, BankNote } from "../typechain";
import { deploy } from "./utils/contracts";

enum LoanState {
  // DUMMY = 0, // TODO: reintroduce after https://github.com/Non-fungible-Technologies/pawnfi-contracts/pull/11 is merged
  Created = 0,
  Active = 1,
  Repaid = 2,
  Defaulted = 3,
}

interface TestContext {
  borrowerBankNote: BankNote;
  lenderBankNote: BankNote;
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

describe("BankNote", () => {
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
    const lenderBankNote = <BankNote>(
      await deploy("BankNote", signers[0], [loanCore.address, "BankNote - Lender", "PBL"])
    );
    const borrowerBankNote = <BankNote>(
      await deploy("BankNote", signers[0], [loanCore.address, "BankNote - Borrower", "PBNs"])
    );

    return {
      borrowerBankNote,
      lenderBankNote,
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
    lenderNote: BankNote,
    borrowerNote: BankNote,
    loanId: BigNumber,
  ) => {
    const transaction = await loanCore.connect(user).startLoan(loanId, lenderNote.address, borrowerNote.address);
    await transaction.wait();
  };

  const repayLoan = async (loanCore: MockLoanCore, user: Signer, loanId: BigNumber) => {
    const transaction = await loanCore.connect(user).repay(loanId);
    await transaction.wait();
  };

  const mintBankNote = async (note: BankNote, user: Signer): Promise<BigNumber> => {
    const transaction = await note.mint(await user.getAddress());
    const receipt = await transaction.wait();

    if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
      return receipt.events[0].args.tokenId;
    } else {
      throw new Error("Unable to mint bank note");
    }
  };

  describe("constructor", () => {
    it("Reverts if loanCore_ address is not provided", async () => {
      const signers: Signer[] = await hre.ethers.getSigners();
      await expect(deploy("BankNote", signers[0], ["BankNote", "BN"])).to.be.reverted;
    });

    it("Creates a BankNote", async () => {
      const signers: Signer[] = await hre.ethers.getSigners();

      const loanCore = <MockLoanCore>await deploy("MockLoanCore", signers[0], []);

      const BankNote = <BankNote>await deploy("BankNote", signers[0], [loanCore.address, "BankNote", "BN"]);

      expect(BankNote).exist;
    });
  });

  describe("mint", () => {
    it("Reverts if sender is not loanCore", async () => {
      const { lenderBankNote: BankNote, user, other } = await setupTestContext();
      const transaction = BankNote.connect(other).mint(await user.getAddress());
      await expect(transaction).to.be.reverted;
    });

    it("Assigns a BankNote NFT to the recipient", async () => {
      const { lenderBankNote: BankNote, user, other } = await setupTestContext();
      const transaction = await BankNote.connect(user).mint(await other.getAddress());
      const receipt = await transaction.wait();

      if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
        return expect(receipt.events[0]).exist;
      } else {
        throw new Error("Unable to mint bank note");
      }
    });
  });

  describe("burn", () => {
    it("Reverts if loanCore attempts to burn active note", async () => {
      const { borrowerBankNote: BankNote, lenderBankNote, loanCore, mockAssetWrapper, user } = await setupTestContext();
      const loanTerms = createLoanTerms(mockAssetWrapper.address);
      const BankNoteId = await mintBankNote(BankNote, user);
      const loanId = await createLoan(loanCore, user, loanTerms);
      await startLoan(loanCore, user, lenderBankNote, BankNote, loanId);
      const loanData = await loanCore.connect(user).getLoan(loanId);
      expect(loanData.state).to.equal(LoanState.Active);
      await expect(BankNote.connect(user).burn(loanId, BankNoteId)).to.be.reverted;
    });

    it("Reverts if sender does not own the note", async () => {
      const {
        borrowerBankNote: BankNote,
        lenderBankNote,
        loanCore,
        mockAssetWrapper,
        user,
        other,
      } = await setupTestContext();
      const loanTerms = createLoanTerms(mockAssetWrapper.address);
      const BankNoteId = await mintBankNote(BankNote, user);
      const loanId = await createLoan(loanCore, user, loanTerms);
      await startLoan(loanCore, user, lenderBankNote, BankNote, loanId);
      const loanData = await loanCore.connect(user).getLoan(loanId);
      expect(loanData.state).to.equal(LoanState.Active);
      await repayLoan(loanCore, user, loanId);
      const loanDataAfterRepay = await loanCore.connect(user).getLoan(loanId);
      expect(loanDataAfterRepay.state).to.equal(LoanState.Repaid);
      await expect(BankNote.connect(other).burn(loanId, BankNoteId)).to.be.reverted;
    });

    it("Burns a BankNote NFT", async () => {
      const { borrowerBankNote: BankNote, lenderBankNote, loanCore, mockAssetWrapper, user } = await setupTestContext();
      const BankNoteId = await mintBankNote(BankNote, user);
      const loanTerms = createLoanTerms(mockAssetWrapper.address);
      const loanId = await createLoan(loanCore, user, loanTerms);
      await startLoan(loanCore, user, lenderBankNote, BankNote, loanId);
      const loanData = await loanCore.connect(user).getLoan(loanId);
      expect(loanData.state).to.equal(LoanState.Active);
      await repayLoan(loanCore, user, loanId);
      const loanDataAfterRepay = await loanCore.connect(user).getLoan(loanId);
      expect(loanDataAfterRepay.state).to.equal(LoanState.Repaid);
      expect(BankNote.connect(user).burn(loanId, BankNoteId));
    });
  });
});
