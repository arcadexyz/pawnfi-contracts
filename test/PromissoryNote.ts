import { expect } from "chai";
import hre from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber, BigNumberish } from "ethers";

import { MockLoanCore, MockERC721, PromissoryNote } from "../typechain";
import { deploy } from "./utils/contracts";
import { LoanTerms, LoanState } from "./utils/types";
import { fromRpcSig } from "ethereumjs-util";

type Signer = SignerWithAddress;

interface TestContext {
  borrowerPromissoryNote: PromissoryNote;
  lenderPromissoryNote: PromissoryNote;
  loanCore: MockLoanCore;
  mockAssetWrapper: MockERC721;
  user: Signer;
  other: Signer;
  signers: Signer[];
}

describe("PromissoryNote", () => {
  const createLoanTerms = (
    payableCurrency: string,
    {
      durationSecs = 360000,
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
    const transaction = await note.mint(await user.getAddress(), 1);
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
      const transaction = promissoryNote.connect(other).mint(await user.getAddress(), 1);
      await expect(transaction).to.be.reverted;
    });

    it("Assigns a PromissoryNote NFT to the recipient", async () => {
      const { lenderPromissoryNote: promissoryNote, user, other } = await setupTestContext();
      const transaction = await promissoryNote.connect(user).mint(await other.getAddress(), 1);
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

  describe("Permit", () => {
    const typedData = {
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit" as const,
    };

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const chainId = hre.network.config.chainId!;
    const maxDeadline = hre.ethers.constants.MaxUint256;

    const buildData = (
      chainId: number,
      verifyingContract: string,
      name: string,
      version: string,
      owner: string,
      spender: string,
      tokenId: BigNumberish,
      nonce: number,
      deadline = maxDeadline,
    ) => {
      return Object.assign({}, typedData, {
        domain: {
          name,
          version,
          chainId,
          verifyingContract,
        },
        message: { owner, spender, tokenId, nonce, deadline },
      });
    };

    let promissoryNote: PromissoryNote;
    let user: Signer;
    let other: Signer;
    let promissoryNoteId: BigNumber;
    let signature: string;
    let v: number;
    let r: Buffer;
    let s: Buffer;

    beforeEach(async () => {
      ({ borrowerPromissoryNote: promissoryNote, user, other } = await setupTestContext());
      promissoryNoteId = await mintPromissoryNote(promissoryNote, user);

      const data = buildData(
        chainId,
        promissoryNote.address,
        await promissoryNote.name(),
        "1",
        await user.getAddress(),
        await other.getAddress(),
        promissoryNoteId,
        0,
      );

      signature = await user._signTypedData(data.domain, data.types, data.message);
      ({ v, r, s } = fromRpcSig(signature));
    });

    it("should accept owner signature", async () => {
      let approved = await promissoryNote.getApproved(promissoryNoteId);
      expect(approved).to.equal(hre.ethers.constants.AddressZero);

      await expect(
        promissoryNote.permit(
          await user.getAddress(),
          await other.getAddress(),
          promissoryNoteId,
          maxDeadline,
          v,
          r,
          s,
        ),
      )
        .to.emit(promissoryNote, "Approval")
        .withArgs(await user.getAddress(), await other.getAddress(), promissoryNoteId);

      approved = await promissoryNote.getApproved(promissoryNoteId);
      expect(approved).to.equal(await other.getAddress());
    });

    it("rejects if given owner is not real owner", async () => {
      const approved = await promissoryNote.getApproved(promissoryNoteId);
      expect(approved).to.equal(hre.ethers.constants.AddressZero);

      await expect(
        promissoryNote.permit(
          await other.getAddress(),
          await other.getAddress(),
          promissoryNoteId,
          maxDeadline,
          v,
          r,
          s,
        ),
      ).to.be.revertedWith("ERC721Permit: not owner");
    });

    it("rejects if promissoryNoteId is not valid", async () => {
      const approved = await promissoryNote.getApproved(promissoryNoteId);
      expect(approved).to.equal(hre.ethers.constants.AddressZero);
      const otherNoteId = await mintPromissoryNote(promissoryNote, user);

      await expect(
        promissoryNote.permit(await other.getAddress(), await other.getAddress(), otherNoteId, maxDeadline, v, r, s),
      ).to.be.revertedWith("ERC721Permit: not owner");
    });

    it("rejects reused signature", async () => {
      await expect(
        promissoryNote.permit(
          await user.getAddress(),
          await other.getAddress(),
          promissoryNoteId,
          maxDeadline,
          v,
          r,
          s,
        ),
      )
        .to.emit(promissoryNote, "Approval")
        .withArgs(await user.getAddress(), await other.getAddress(), promissoryNoteId);

      await expect(
        promissoryNote.permit(
          await user.getAddress(),
          await other.getAddress(),
          promissoryNoteId,
          maxDeadline,
          v,
          r,
          s,
        ),
      ).to.be.revertedWith("ERC721Permit: invalid signature");
    });

    it("rejects other signature", async () => {
      const data = buildData(
        chainId,
        promissoryNote.address,
        await promissoryNote.name(),
        "1",
        await user.getAddress(),
        await other.getAddress(),
        promissoryNoteId,
        0,
      );

      const signature = await other._signTypedData(data.domain, data.types, data.message);
      const { v, r, s } = fromRpcSig(signature);

      await expect(
        promissoryNote.permit(
          await user.getAddress(),
          await other.getAddress(),
          promissoryNoteId,
          maxDeadline,
          v,
          r,
          s,
        ),
      ).to.be.revertedWith("ERC721Permit: invalid signature");
    });

    it("rejects expired signature", async () => {
      const data = buildData(
        chainId,
        promissoryNote.address,
        await promissoryNote.name(),
        "1",
        await user.getAddress(),
        await other.getAddress(),
        promissoryNoteId,
        0,
        BigNumber.from("1234"),
      );

      const signature = await user._signTypedData(data.domain, data.types, data.message);
      const { v, r, s } = fromRpcSig(signature);

      const approved = await promissoryNote.getApproved(promissoryNoteId);
      expect(approved).to.equal(hre.ethers.constants.AddressZero);

      await expect(
        promissoryNote.permit(
          await user.getAddress(),
          await other.getAddress(),
          promissoryNoteId,
          BigNumber.from("1234"),
          v,
          r,
          s,
        ),
      ).to.be.revertedWith("ERC721Permit: expired deadline");
    });
  });
});
