import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { BigNumber, BigNumberish, Signer } from "ethers";

import { AssetWrapper, FeeController, PromissoryNote, LoanCore, MockERC20 } from "../typechain";
import { BlockchainTime } from "./utils/time";
import { deploy } from "./utils/contracts";

enum LoanState {
  DUMMY = 0,
  Created = 1,
  Active = 2,
  Repaid = 3,
  Defaulted = 4,
}

const ORIGINATOR_ROLE = "0x59abfac6520ec36a6556b2a4dd949cc40007459bcd5cd2507f1e5cc77b6bc97e";
const REPAYER_ROLE = "0x9c60024347074fd9de2c1e36003080d22dbc76a41ef87444d21e361bcb39118e";

const ZERO = hre.ethers.utils.parseUnits("0", 18);

interface LoanTerms {
  dueDate: BigNumberish;
  principal: BigNumber;
  interest: BigNumber;
  collateralTokenId: BigNumber;
  payableCurrency: string;
}

interface TestContext {
  loanCore: LoanCore;
  mockERC20: MockERC20;
  borrowerNote: PromissoryNote;
  lenderNote: PromissoryNote;
  assetWrapper: AssetWrapper;
  user: Signer;
  other: Signer;
  signers: Signer[];
}

describe("Integration", () => {
  const blockchainTime = new BlockchainTime();

  /**
   * Sets up a test context, deploying new contracts and returning them for use in a test
   */
  const setupTestContext = async (): Promise<TestContext> => {
    const signers: Signer[] = await hre.ethers.getSigners();

    const assetWrapper = <AssetWrapper>await deploy("AssetWrapper", signers[0], ["Mock AssetWrapper", "MA"]);
    const feeController = <FeeController>await deploy("FeeController", signers[0], []);
    const loanCore = <LoanCore>await deploy("LoanCore", signers[0], [assetWrapper.address, feeController.address]);

    await loanCore.connect(signers[0]).grantRole(ORIGINATOR_ROLE, await signers[0].getAddress());
    await loanCore.connect(signers[0]).grantRole(REPAYER_ROLE, await signers[0].getAddress());
    const borrowerNoteAddress = await loanCore.borrowerNote();
    const borrowerNote = <PromissoryNote>(
      await (await ethers.getContractFactory("PromissoryNote")).attach(borrowerNoteAddress)
    );

    const lenderNoteAddress = await loanCore.lenderNote();
    const lenderNote = <PromissoryNote>(
      await (await ethers.getContractFactory("PromissoryNote")).attach(lenderNoteAddress)
    );

    const mockERC20 = <MockERC20>await deploy("MockERC20", signers[0], ["Mock ERC20", "MOCK"]);

    return {
      loanCore,
      borrowerNote,
      lenderNote,
      assetWrapper,
      mockERC20,
      user: signers[0],
      other: signers[1],
      signers: signers.slice(2),
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

  /**
   * Initialize a new loan, returning the loanId
   */
  const createLoan = async (loanCore: LoanCore, user: Signer, terms: LoanTerms): Promise<BigNumber> => {
    const tx = await loanCore.connect(user).createLoan(terms);
    const receipt = await tx.wait();

    if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
      return receipt.events[0].args.loanId;
    } else {
      throw new Error("Unable to initialize loan");
    }
  };

  const createCnft = async (assetWrapper: AssetWrapper, user: Signer) => {
    const tx = await assetWrapper.initializeBundle(await user.getAddress());
    const receipt = await tx.wait();
    if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
      return receipt.events[0].args.tokenId;
    } else {
      throw new Error("Unable to initialize bundle");
    }
  };

  /**
   * Assert equality between two LoanTerms objects
   */
  const assertTermsEquality = (actual: LoanTerms, expected: LoanTerms) => {
    expect(actual.dueDate).to.equal(expected.dueDate);
    expect(actual.principal).to.equal(expected.principal);
    expect(actual.interest).to.equal(expected.interest);
    expect(actual.collateralTokenId).to.equal(expected.collateralTokenId);
    expect(actual.payableCurrency).to.equal(expected.payableCurrency);
  };

  describe("Create Loan", function () {
    it("should successfully create a loan", async () => {
      const { loanCore, mockERC20, assetWrapper, user } = await setupTestContext();
      const collateralTokenId = await createCnft(assetWrapper, user);
      const terms = createLoanTerms(mockERC20.address, { collateralTokenId });

      const loanId = await createLoan(loanCore, user, terms);
      expect(loanId.gte(ZERO)).to.be.true;

      const storedLoanData = await loanCore.getLoan(loanId);
      expect(storedLoanData.borrowerNoteId).to.equal(BigNumber.from(0));
      expect(storedLoanData.lenderNoteId).to.equal(BigNumber.from(0));
      expect(storedLoanData.state).to.equal(LoanState.Created);
      assertTermsEquality(storedLoanData.terms, terms);
    });

    it("should emit the LoanCreated event", async () => {
      const { loanCore, mockERC20, assetWrapper, user } = await setupTestContext();
      const collateralTokenId = await createCnft(assetWrapper, user);
      const terms = createLoanTerms(mockERC20.address, { collateralTokenId });

      await expect(loanCore.connect(user).createLoan(terms)).to.emit(loanCore, "LoanCreated");
    });

    it("should successfully create a bunch of loans with different loanIds", async () => {
      const { loanCore, mockERC20, assetWrapper, user } = await setupTestContext();

      const loanIds = new Set();
      for (let i = 0; i < 10; i++) {
        const collateralTokenId = await createCnft(assetWrapper, user);
        const terms = createLoanTerms(mockERC20.address, { collateralTokenId });

        const loanId = await createLoan(loanCore, user, terms);
        expect(loanIds.has(loanId)).to.be.false;
        loanIds.add(loanId);
      }
    });

    it("should fail to create a loan with nonexistent collateral", async () => {
      const { loanCore, mockERC20, user } = await setupTestContext();
      const terms = createLoanTerms(mockERC20.address);

      await expect(createLoan(loanCore, user, terms)).to.be.revertedWith("ERC721: owner query for nonexistent token");
    });

    it("should fail to create a loan with passed due date", async () => {
      const { loanCore, mockERC20, assetWrapper, user } = await setupTestContext();
      const collateralTokenId = await createCnft(assetWrapper, user);
      const terms = createLoanTerms(mockERC20.address, {
        collateralTokenId,
        dueDate: await blockchainTime.secondsFromNow(-1000),
      });

      await expect(createLoan(loanCore, user, terms)).to.be.revertedWith("LoanCore::create: Loan is already expired");
    });

    it("should fail to create a loan with reused collateral", async () => {
      const { loanCore, mockERC20, assetWrapper, user } = await setupTestContext();
      const collateralTokenId = await createCnft(assetWrapper, user);
      const terms = createLoanTerms(mockERC20.address, { collateralTokenId });

      await createLoan(loanCore, user, terms);

      await expect(createLoan(loanCore, user, terms)).to.be.revertedWith(
        "LoanCore::create: Collateral token already in use",
      );
    });
  });
});
