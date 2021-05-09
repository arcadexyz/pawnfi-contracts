import { expect } from "chai";
import hre from "hardhat";
import { BigNumber, Signer } from "ethers";
import { LoanCore, MockERC721, BorrowerNote } from "../typechain";
import { mint as mintERC721 } from "./utils/erc721";
import { ZERO_ADDRESS } from "./utils/erc20";
import { deploy } from "./utils/contracts";

const ZERO = hre.ethers.utils.parseUnits("0", 18);

interface TestContext {
  borrowerNote: BorrowerNote;
  loanCore: LoanCore;
  user: Signer;
  other: Signer;
  signers: Signer[];
}

describe("BorrowerNote", () => {

  const setupTestContext = async (): Promise<TestContext> => {
    const signers: Signer[] = await hre.ethers.getSigners();
    const mockBorrowerNote = <MockERC721>await deploy("MockERC721", signers[0], ["Mock BorrowerNote", "MB"]);
    const mockLenderNote = <MockERC721>await deploy("MockERC721", signers[0], ["Mock LenderNote", "ML"]);
    const mockAssetWrapper = <MockERC721>await deploy("MockERC721", signers[0], ["Mock AssetWrapper", "MA"]);
    
    const loanCore = <LoanCore>(
      await deploy("LoanCore", signers[0], [mockBorrowerNote.address, mockLenderNote.address, mockAssetWrapper.address])
    );      
    
    const borrowerNote = <BorrowerNote>(
      await deploy("BorrowerNote", signers[0], [loanCore.address, "BorrowerNote", "BN"])
    );
    
    return { borrowerNote, loanCore, user: signers[0], other: signers[1], signers: signers.slice(2) };
    };

  const mintBorrowerNote = async (borrowerNote: BorrowerNote, user: Signer): Promise<BigNumber> => {
    const transaction = await borrowerNote.connect(user).mint(await user.getAddress());
    const receipt = await transaction.wait();

    if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
      return receipt.events[0].args.tokenId;
    } else {
      throw new Error("Unable to mint borrower note");
    }
  };

  describe("constructor", () => {

    it("Reverts if loanCore_ address is not provided", async () => {
      const signers: Signer[] = await hre.ethers.getSigners();
      expect(deploy("BorrowerNote", signers[0], ["BorrowerNote", "BN"])).to.be.reverted;
    });

    it("Reverts if loanCore_ address does not support loanCore interface", async () => {
      const signers: Signer[] = await hre.ethers.getSigners();
      expect(deploy("BorrowerNote", signers[0], [ZERO_ADDRESS, "BorrowerNote", "BN"])).to.be.reverted;
    });

    it("Creates a BorrowerNote", async () => {

      const signers: Signer[] = await hre.ethers.getSigners();
      const mockBorrowerNote = <MockERC721>await deploy("MockERC721", signers[0], ["Mock BorrowerNote", "MB"]);
      const mockLenderNote = <MockERC721>await deploy("MockERC721", signers[0], ["Mock LenderNote", "ML"]);
      const mockAssetWrapper = <MockERC721>await deploy("MockERC721", signers[0], ["Mock AssetWrapper", "MA"]);
      
      const loanCore = <LoanCore>(
        await deploy("LoanCore", signers[0], [mockBorrowerNote.address, mockLenderNote.address, mockAssetWrapper.address])
      );      
      
      const borrowerNote = <BorrowerNote>(
        await deploy("BorrowerNote", signers[0], [loanCore.address, "BorrowerNote", "BN"])
      );

      expect(borrowerNote).exist;

    });

  });

  describe("mint", () => {

    it("Reverts if sender is not loanCore", async () => {
      const { borrowerNote, loanCore, user, other } = await setupTestContext();
      const transaction = borrowerNote.connect(ZERO_ADDRESS).mint(ZERO_ADDRESS);
      expect(transaction).to.be.reverted;

    });

    it("Assigns a BorrowerNote NFT to the recipient", async () => {

      const { borrowerNote, loanCore, user, other } = await setupTestContext();
      const transaction = await borrowerNote.connect(user).mint(await other.getAddress());
      const receipt = await transaction.wait();

      if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
        return expect(receipt.events[0]).exist;
      } else {
        throw new Error("Unable to mint borrower note");
      }

    });

  });

  describe("burn", () => {

    it("Reverts if loanCore attempts to burn active note", async() => {

      const { borrowerNote, loanCore, user, other } = await setupTestContext();
      const transaction = await borrowerNote.connect(user).mint(await other.getAddress());
      const receipt = await transaction.wait();
      const tokenId = mintBorrowerNote(borrowerNote, user);
      const burnResult = await borrowerNote.connect(user).burn(await tokenId);
      expect(burnResult).to.be.reverted;

    });

    it("Reverts if sender does not own the note", async() => {

      const { borrowerNote, loanCore, user, other } = await setupTestContext();
      const transaction = await borrowerNote.connect(user).mint(await other.getAddress());
      const receipt = await transaction.wait();
      const tokenId = mintBorrowerNote(borrowerNote, user);
      expect(await borrowerNote.connect(other).burn(await tokenId)).to.be.reverted;

    });

    it("Burns a LenderNote NFT", async() => {



    });

  });

});
