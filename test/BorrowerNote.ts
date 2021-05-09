import { expect } from "chai";
import hre from "hardhat";
import { BigNumber, Signer } from "ethers";
import { MockLoanCore, BorrowerNote } from "../typechain";
import { ZERO_ADDRESS } from "./utils/erc20";
import { deploy } from "./utils/contracts";

const ZERO = hre.ethers.utils.parseUnits("0", 18);

interface TestContext {
  borrowerNote: BorrowerNote;
  mockLoanCore: MockLoanCore,
  user: Signer;
  other: Signer;
  signers: Signer[];
}

describe("BorrowerNote", () => {

  const setupTestContext = async (): Promise<TestContext> => {
    const signers: Signer[] = await hre.ethers.getSigners();
    const mockLoanCore = <MockLoanCore>await deploy("MockLoanCore", signers[0], [signers[0].getAddress(), "Mock ERC20", "MOCK"]);
    const borrowerNote = <BorrowerNote>(await deploy("BorrowerNote", signers[0], [mockLoanCore.address, "BorrowerNote", "BN"]));
    return { borrowerNote, mockLoanCore, user: signers[0], other: signers[1], signers: signers.slice(2) };
  };

  const mintBorrowerNote = async (borrowerNote: BorrowerNote, user: Signer): Promise<BigNumber> =>  {
    const tx = await borrowerNote.connect(user).mint(await user.getAddress());
    const receipt = await tx.wait();

    if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
      return receipt.events[0].args.loanCore_;
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
      const borrowerNote = <BorrowerNote>(await deploy("BorrowerNote", signers[0], [mockLoanCore.address, "BorrowerNote", "BN"]));
      expect(borrowerNote.args.loanCore_).to.be.true;
       });
  });

  describe("mint", () => {
    it("Reverts if sender is not loanCore", async () => {
      const { borrowerNote, mockERC20, user, other } = await setupTestContext();
      const transaction = borrowerNote.connect(ZERO_ADDRESS).mint(ZERO_ADDRESS);
      expect(transaction).to.be.reverted;
    });

    it("Assigns a BorrowerNote NFT to the recipient", async () => {
      const { borrowerNote, mockERC20, user, other } = await setupTestContext();
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
