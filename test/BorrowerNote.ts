import { expect } from "chai";
import hre from "hardhat";
import { Signer } from "ethers";
import { BorrowerNote } from "../typechain/BorrowerNote";
import { approve, mint, ZERO_ADDRESS} from "./utils/erc20";
import { deploy } from "./utils/contracts";

const ZERO = hre.ethers.utils.parseUnits("0", 18);

interface TestContext {

  borrowerNote: BorrowerNote;
  user: Signer;
  other: Signer;
  signers: Signer[];

}

describe("BorrowerNote", () => {

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
        const address = "";
        const borrowerNote = <BorrowerNote>await deploy("BorrowerNote", signers[0], [address, "BorrowerNote", "BN"]);
        expect(borrowerNote).to.be.true;

      });

    });

    describe("mint", () => {

      it("Reverts if sender is not loanCore", async () => {

        const signers: Signer[] = await hre.ethers.getSigners();
        const nonLoanCoreSignature = await signers[0].signMessage("Hello World");
        const borrowerSignature = await signers[1].signMessage("Hello World");
        const borrowerNote = <BorrowerNote>await deploy("BorrowerNote", signers[0], [nonLoanCoreSignature , "BorrowerNote", "BN"]);
        expect(await borrowerNote.mint(borrowerSignature)).to.be.reverted;

      });

      it("Assigns a BorrowerNote NFT to the recipient", async () => {

        const signers: Signer[] = await hre.ethers.getSigners();
        const loanCoreSignature = await signers[0].signMessage("Hello World");
        const borrowerSignature = await signers[1].signMessage("Hello World");
        const borrowerNote = <BorrowerNote>await deploy("BorrowerNote", signers[0], [loanCoreSignature, "BorrowerNote", "BN"]);
        expect(await borrowerNote.mint(borrowerSignature)).to.be.reverted;

      });

    });

    describe("burn", () => {
      it("Reverts if loanCore attempts to burn active note");
      it("Reverts if sender does not own the note");
      it("Burns a LenderNote NFT");
    });

    describe("supportsInterface", () => {});

    describe("_beforeTokenTransfer", () => {});
  
});
