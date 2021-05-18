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
  PromissoryNote: PromissoryNote;
  mockLenderNote: MockERC721;
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
    const mockLenderNote = <MockERC721>await deploy("MockERC721", signers[0], ["Mock LenderNote", "LN"]);
    const loanCore = <MockLoanCore>await deploy("MockLoanCore", signers[0], []);
    const PromissoryNote = <PromissoryNote>await deploy("PromissoryNote", signers[0], [loanCore.address, "PromissoryNote", "BN"]);

    return {
      PromissoryNote,
      mockLenderNote,
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
    lenderNote: MockERC721,
    PromissoryNote: PromissoryNote,
    loanId: BigNumber,
  ) => {
    const transaction = await loanCore.connect(user).startLoan(loanId, lenderNote.address, PromissoryNote.address);
    await transaction.wait();
  };

  const repayLoan = async (loanCore: MockLoanCore, user: Signer, loanId: BigNumber) => {
    const transaction = await loanCore.connect(user).repay(loanId);
    await transaction.wait();
  };

  const mintPromissoryNote = async (PromissoryNote: PromissoryNote, user: Signer): Promise<BigNumber> => {
    const transaction = await PromissoryNote.mint(await user.getAddress());
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
      await expect(deploy("PromissoryNote", signers[0], ["PromissoryNote", "BN"])).to.be.reverted;
    });

    it("Creates a PromissoryNote", async () => {
      const signers: Signer[] = await hre.ethers.getSigners();

      const loanCore = <MockLoanCore>await deploy("MockLoanCore", signers[0], []);

      const PromissoryNote = <PromissoryNote>await deploy("PromissoryNote", signers[0], [loanCore.address, "PromissoryNote", "BN"]);

      expect(PromissoryNote).exist;
    });
  });

  describe("mint", () => {
    it("Reverts if sender is not loanCore", async () => {
      const { PromissoryNote, user, other } = await setupTestContext();
      const transaction = PromissoryNote.connect(other).mint(await user.getAddress());
      await expect(transaction).to.be.reverted;
    });

    it("Assigns a PromissoryNote NFT to the recipient", async () => {
      const { PromissoryNote, user, other } = await setupTestContext();
      const transaction = await PromissoryNote.connect(user).mint(await other.getAddress());
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
      const { PromissoryNote, mockLenderNote, loanCore, mockAssetWrapper, user } = await setupTestContext();
      const loanTerms = createLoanTerms(mockAssetWrapper.address);
      const PromissoryNoteId = await mintPromissoryNote(PromissoryNote, user);
      const loanId = await createLoan(loanCore, user, loanTerms);
      await startLoan(loanCore, user, mockLenderNote, PromissoryNote, loanId);
      const loanData = await loanCore.connect(user).getLoan(loanId);
      expect(loanData.state).to.equal(LoanState.Active);
      await expect(PromissoryNote.connect(user).burn(loanId, PromissoryNoteId)).to.be.reverted;
    });

    it("Reverts if sender does not own the note", async () => {
      const { PromissoryNote, mockLenderNote, loanCore, mockAssetWrapper, user, other } = await setupTestContext();
      const loanTerms = createLoanTerms(mockAssetWrapper.address);
      const PromissoryNoteId = await mintPromissoryNote(PromissoryNote, user);
      const loanId = await createLoan(loanCore, user, loanTerms);
      await startLoan(loanCore, user, mockLenderNote, PromissoryNote, loanId);
      const loanData = await loanCore.connect(user).getLoan(loanId);
      expect(loanData.state).to.equal(LoanState.Active);
      await repayLoan(loanCore, user, loanId);
      expect(loanData.state).to.equal(LoanState.Repaid);
      await expect(PromissoryNote.connect(other).burn(loanId, PromissoryNoteId)).to.be.reverted;
    });

    it("Burns a LenderNote NFT", async () => {
      const { PromissoryNote, loanCore, mockLenderNote, mockAssetWrapper, user } = await setupTestContext();
      const PromissoryNoteId = await mintPromissoryNote(PromissoryNote, user);
      const loanTerms = createLoanTerms(mockAssetWrapper.address);
      const loanId = await createLoan(loanCore, user, loanTerms);
      await startLoan(loanCore, user, mockLenderNote, PromissoryNote, loanId);
      const loanData = await loanCore.connect(user).getLoan(loanId);
      expect(loanData.state).to.equal(LoanState.Active);
      await repayLoan(loanCore, user, loanId);
      expect(loanData.state).to.equal(LoanState.Repaid);
      expect(PromissoryNote.connect(user).burn(loanId, PromissoryNoteId));
    });
  });
});
