import { expect } from "chai";
import hre from "hardhat";
import { BigNumber, Signer } from "ethers";

import { AssetWrapper } from "../typechain/AssetWrapper";
import { MockERC20 } from "../typechain/MockERC20";
import { approve, mint, ZERO_ADDRESS } from "./utils/erc20";
import { deploy } from "./utils/contracts";

const ZERO = hre.ethers.utils.parseUnits("0", 18);

interface TestContext {
  assetWrapper: AssetWrapper;
  mockERC20: MockERC20;
  user: Signer;
  other: Signer;
}

describe("AssetWrapper", () => {
  /**
   * Sets up a test context, deploying new contracts and returning them for use in a test
   */
  const setupTestContext = async (): Promise<TestContext> => {
    const signers: Signer[] = await hre.ethers.getSigners();

    const assetWrapper = <AssetWrapper>await deploy("AssetWrapper", signers[0], ["AssetWrapper", "WRP"]);
    const mockERC20 = <MockERC20>await deploy("MockERC20", signers[0], ["Mock ERC20", "MOCK"]);

    return { assetWrapper, mockERC20, user: signers[0], other: signers[1] };
  };

  /**
   * Initialize a new bundle, returning the bundleId
   */
  const initializeBundle = async (assetWrapper: AssetWrapper, user: Signer): Promise<BigNumber> => {
    const tx = await assetWrapper.connect(user).initializeBundle(await user.getAddress());
    const receipt = await tx.wait();

    if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
      return receipt.events[0].args.tokenId;
    } else {
      throw new Error("Unable to initialize bundle");
    }
  };

  describe("Initialize Bundle", function () {
    it("should successfully initialize a bundle", async () => {
      const { assetWrapper, user } = await setupTestContext();

      const bundleId = await initializeBundle(assetWrapper, user);
      expect(bundleId.gte(ZERO)).to.be.true;
    });

    it("should initialize multiple bundles with unique ids", async () => {
      const { assetWrapper, user } = await setupTestContext();

      const bundleIds = new Set();
      const size = 25;

      for (let i = 0; i < size; i++) {
        const bundleId = await initializeBundle(assetWrapper, user);
        expect(bundleId.gte(ZERO)).to.be.true;
        expect(bundleIds.has(bundleId)).to.be.false;
        bundleIds.add(bundleId);
      }

      expect(bundleIds.size).to.equal(size);
    });
  });

  describe("Deposit", () => {
    it("should accept deposit from an ERC20 token", async () => {
      const { assetWrapper, mockERC20, user } = await setupTestContext();
      const amount = hre.ethers.utils.parseUnits("50", 18);

      await mint(mockERC20, user, amount);
      await approve(mockERC20, user, assetWrapper.address, amount);

      const bundleId = await initializeBundle(assetWrapper, user);

      await expect(assetWrapper.connect(user).depositERC20(mockERC20.address, amount, bundleId))
        .to.emit(mockERC20, "Transfer")
        .withArgs(await user.getAddress(), assetWrapper.address, amount)
        .to.emit(assetWrapper, "DepositERC20")
        .withArgs(mockERC20.address, amount, bundleId);

      const holdingsData = await assetWrapper.bundleERC20Holdings(bundleId, 0);
      expect(holdingsData.tokenAddress).to.equal(mockERC20.address);
      expect(holdingsData.amount).to.equal(amount);
    });

    it("should throw when not approved", async () => {
      const { assetWrapper, mockERC20, user } = await setupTestContext();
      const amount = hre.ethers.utils.parseUnits("50", 18);

      await mint(mockERC20, user, amount);

      const bundleId = await initializeBundle(assetWrapper, user);

      await expect(assetWrapper.connect(user).depositERC20(mockERC20.address, amount, bundleId)).to.be.reverted;
    });

    it("should throw when depositing more than owned", async () => {
      const { assetWrapper, mockERC20, user } = await setupTestContext();
      const amount = hre.ethers.utils.parseUnits("50", 18);

      await mint(mockERC20, user, amount);
      await approve(mockERC20, user, assetWrapper.address, amount);

      const bundleId = await initializeBundle(assetWrapper, user);

      await expect(assetWrapper.connect(user).depositERC20(mockERC20.address, amount.mul(2), bundleId)).to.be.reverted;
    });

    it("should accept multiple deposits from an ERC20 token", async () => {
      const { assetWrapper, mockERC20, user } = await setupTestContext();
      const bundleId = await initializeBundle(assetWrapper, user);
      const baseAmount = hre.ethers.utils.parseUnits("10", 18);

      await approve(mockERC20, user, assetWrapper.address, hre.ethers.constants.MaxUint256);

      for (let i = 0; i < 10; i++) {
        const amount = baseAmount.mul(i);
        await mint(mockERC20, user, amount);

        await expect(assetWrapper.connect(user).depositERC20(mockERC20.address, amount, bundleId))
          .to.emit(mockERC20, "Transfer")
          .withArgs(await user.getAddress(), assetWrapper.address, amount)
          .to.emit(assetWrapper, "DepositERC20")
          .withArgs(mockERC20.address, amount, bundleId);

        const holdingsData = await assetWrapper.bundleERC20Holdings(bundleId, i);
        expect(holdingsData.tokenAddress).to.equal(mockERC20.address);
        expect(holdingsData.amount).to.equal(amount);
      }
    });

    it("should accept deposits from multiple ERC20 tokens", async () => {
      const { assetWrapper, user } = await setupTestContext();
      const bundleId = await initializeBundle(assetWrapper, user);
      const baseAmount = hre.ethers.utils.parseUnits("10", 18);

      for (let i = 0; i < 10; i++) {
        const mockERC20 = <MockERC20>await deploy("MockERC20", user, ["Mock ERC20", "MOCK" + i]);
        const amount = baseAmount.mul(i);

        await mint(mockERC20, user, amount);
        await approve(mockERC20, user, assetWrapper.address, amount);

        await expect(assetWrapper.connect(user).depositERC20(mockERC20.address, amount, bundleId))
          .to.emit(mockERC20, "Transfer")
          .withArgs(await user.getAddress(), assetWrapper.address, amount)
          .to.emit(assetWrapper, "DepositERC20")
          .withArgs(mockERC20.address, amount, bundleId);

        const holdingsData = await assetWrapper.bundleERC20Holdings(bundleId, i);
        expect(holdingsData.tokenAddress).to.equal(mockERC20.address);
        expect(holdingsData.amount).to.equal(amount);
      }
    });
  });

  describe("Withdraw", () => {
    /**
     * Set up a withdrawal test by depositing some ERC20s into a bundle
     */
    const initializeAndDeposit = async (
      token: MockERC20,
      assetWrapper: AssetWrapper,
      amount: BigNumber,
      user: Signer,
      bundleId: BigNumber,
    ) => {
      await mint(token, user, amount);
      await approve(token, user, assetWrapper.address, amount);
      await assetWrapper.connect(user).depositERC20(token.address, amount, bundleId);
    };

    it("should withdraw single deposit from a bundle", async () => {
      const { assetWrapper, mockERC20, user } = await setupTestContext();
      const amount = hre.ethers.utils.parseUnits("50", 18);
      const bundleId = await initializeBundle(assetWrapper, user);
      await initializeAndDeposit(mockERC20, assetWrapper, amount, user, bundleId);

      await expect(assetWrapper.connect(user).withdraw(bundleId))
        .to.emit(mockERC20, "Transfer")
        .withArgs(assetWrapper.address, await user.getAddress(), amount);
    });

    it("should throw when withdraw called by non-owner", async () => {
      const { assetWrapper, mockERC20, user, other } = await setupTestContext();
      const amount = hre.ethers.utils.parseUnits("50", 18);
      const bundleId = await initializeBundle(assetWrapper, user);
      await initializeAndDeposit(mockERC20, assetWrapper, amount, user, bundleId);

      await expect(assetWrapper.connect(other).withdraw(bundleId)).to.be.reverted;
    });

    it("should withdraw when non-owner calls with approval", async () => {
      const { assetWrapper, mockERC20, user, other } = await setupTestContext();
      const amount = hre.ethers.utils.parseUnits("50", 18);
      const bundleId = await initializeBundle(assetWrapper, user);
      await initializeAndDeposit(mockERC20, assetWrapper, amount, user, bundleId);

      await assetWrapper.connect(user).approve(await other.getAddress(), bundleId);
      await expect(assetWrapper.connect(other).withdraw(bundleId))
        .to.emit(mockERC20, "Transfer")
        .withArgs(assetWrapper.address, await other.getAddress(), amount);
    });

    it("should throw when non-owner calls with approval to AssetWrapper", async () => {
      const { assetWrapper, mockERC20, user, other } = await setupTestContext();
      const amount = hre.ethers.utils.parseUnits("50", 18);
      const bundleId = await initializeBundle(assetWrapper, user);
      await initializeAndDeposit(mockERC20, assetWrapper, amount, user, bundleId);

      await assetWrapper.connect(user).approve(assetWrapper.address, bundleId);
      await expect(assetWrapper.connect(other).withdraw(bundleId)).to.be.reverted;
    });
  });
});
