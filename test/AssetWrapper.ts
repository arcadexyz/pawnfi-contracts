import { expect } from "chai";
import hre from "hardhat";
import { BigNumber, Signer } from "ethers";

import { AssetWrapper, MockERC20, MockERC721, MockERC1155 } from "../typechain";
import { approve, mint, ZERO_ADDRESS } from "./utils/erc20";
import { approve as approveERC721, mint as mintERC721 } from "./utils/erc721";
import { approve as approveERC1155, mint as mintERC1155 } from "./utils/erc1155";
import { deploy } from "./utils/contracts";

const ZERO = hre.ethers.utils.parseUnits("0", 18);

interface TestContext {
  assetWrapper: AssetWrapper;
  mockERC20: MockERC20;
  mockERC721: MockERC721;
  mockERC1155: MockERC1155;
  user: Signer;
  other: Signer;
  signers: Signer[];
}

describe("AssetWrapper", () => {
  /**
   * Sets up a test context, deploying new contracts and returning them for use in a test
   */
  const setupTestContext = async (): Promise<TestContext> => {
    const signers: Signer[] = await hre.ethers.getSigners();

    const assetWrapper = <AssetWrapper>await deploy("AssetWrapper", signers[0], ["AssetWrapper", "WRP"]);
    const mockERC20 = <MockERC20>await deploy("MockERC20", signers[0], ["Mock ERC20", "MOCK"]);
    const mockERC721 = <MockERC721>await deploy("MockERC721", signers[0], ["Mock ERC721", "MOCK"]);
    const mockERC1155 = <MockERC1155>await deploy("MockERC1155", signers[0], []);

    return {
      assetWrapper,
      mockERC20,
      mockERC721,
      mockERC1155,
      user: signers[0],
      other: signers[1],
      signers: signers.slice(2),
    };
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
    describe("ERC20", () => {
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
          .withArgs(await user.getAddress(), bundleId, mockERC20.address, amount);

        const holdingsData = await assetWrapper.bundleERC20Holdings(bundleId, 0);
        expect(holdingsData.tokenAddress).to.equal(mockERC20.address);
        expect(holdingsData.amount).to.equal(amount);
      });

      it("should throw when depositing into uninitialized bundle", async () => {
        const { assetWrapper, mockERC20, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseUnits("50", 18);

        const bundleId = BigNumber.from("1005432");

        await expect(assetWrapper.connect(user).depositERC20(mockERC20.address, amount, bundleId)).to.be.revertedWith(
          "Bundle does not exist",
        );
      });

      it("should throw when not approved", async () => {
        const { assetWrapper, mockERC20, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseUnits("50", 18);

        await mint(mockERC20, user, amount);

        const bundleId = await initializeBundle(assetWrapper, user);

        await expect(assetWrapper.connect(user).depositERC20(mockERC20.address, amount, bundleId)).to.be.revertedWith(
          "TransferHelper::transferFrom: transferFrom failed",
        );
      });

      it("should throw when depositing more than owned", async () => {
        const { assetWrapper, mockERC20, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseUnits("50", 18);

        await mint(mockERC20, user, amount);
        await approve(mockERC20, user, assetWrapper.address, amount);

        const bundleId = await initializeBundle(assetWrapper, user);

        await expect(
          assetWrapper.connect(user).depositERC20(mockERC20.address, amount.mul(2), bundleId),
        ).to.be.revertedWith("TransferHelper::transferFrom: transferFrom failed");
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
            .withArgs(await user.getAddress(), bundleId, mockERC20.address, amount);

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
            .withArgs(await user.getAddress(), bundleId, mockERC20.address, amount);

          const holdingsData = await assetWrapper.bundleERC20Holdings(bundleId, i);
          expect(holdingsData.tokenAddress).to.equal(mockERC20.address);
          expect(holdingsData.amount).to.equal(amount);
        }
      });
    });

    describe("ERC721", () => {
      it("should accept deposit from an ERC721 token", async () => {
        const { assetWrapper, mockERC721, user } = await setupTestContext();

        const tokenId = await mintERC721(mockERC721, user);
        await approveERC721(mockERC721, user, assetWrapper.address, tokenId);

        const bundleId = await initializeBundle(assetWrapper, user);

        await expect(assetWrapper.connect(user).depositERC721(mockERC721.address, tokenId, bundleId))
          .to.emit(mockERC721, "Transfer")
          .withArgs(await user.getAddress(), assetWrapper.address, tokenId)
          .to.emit(assetWrapper, "DepositERC721")
          .withArgs(await user.getAddress(), bundleId, mockERC721.address, tokenId);

        const holdingsData = await assetWrapper.bundleERC721Holdings(bundleId, 0);
        expect(holdingsData.tokenAddress).to.equal(mockERC721.address);
        expect(holdingsData.tokenId).to.equal(tokenId);
      });

      it("should throw when depositing into uninitialized bundle", async () => {
        const { assetWrapper, mockERC721, user } = await setupTestContext();

        const tokenId = await mintERC721(mockERC721, user);
        const bundleId = BigNumber.from("1005432");

        await expect(
          assetWrapper.connect(user).depositERC721(mockERC721.address, tokenId, bundleId),
        ).to.be.revertedWith("Bundle does not exist");
      });

      it("should throw when not approved", async () => {
        const { assetWrapper, mockERC721, user } = await setupTestContext();

        const tokenId = await mintERC721(mockERC721, user);
        const bundleId = await initializeBundle(assetWrapper, user);

        await expect(
          assetWrapper.connect(user).depositERC721(mockERC721.address, tokenId, bundleId),
        ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
      });

      it("should accept multiple deposits from an ERC721 token", async () => {
        const { assetWrapper, mockERC721, user } = await setupTestContext();
        const bundleId = await initializeBundle(assetWrapper, user);

        for (let i = 0; i < 10; i++) {
          const tokenId = await mintERC721(mockERC721, user);
          await approveERC721(mockERC721, user, assetWrapper.address, tokenId);

          await expect(assetWrapper.connect(user).depositERC721(mockERC721.address, tokenId, bundleId))
            .to.emit(mockERC721, "Transfer")
            .withArgs(await user.getAddress(), assetWrapper.address, tokenId)
            .to.emit(assetWrapper, "DepositERC721")
            .withArgs(await user.getAddress(), bundleId, mockERC721.address, tokenId);

          const holdingsData = await assetWrapper.bundleERC721Holdings(bundleId, i);
          expect(holdingsData.tokenAddress).to.equal(mockERC721.address);
          expect(holdingsData.tokenId).to.equal(tokenId);
        }
      });

      it("should accept multiple deposits from an ERC721 token with setApprovalForAll", async () => {
        const { assetWrapper, mockERC721, user } = await setupTestContext();
        const bundleId = await initializeBundle(assetWrapper, user);

        const tokenIds = [];
        for (let i = 0; i < 10; i++) {
          const tokenId = await mintERC721(mockERC721, user);
          tokenIds.push(tokenId);
        }

        await mockERC721.connect(user).setApprovalForAll(assetWrapper.address, true);

        for (let i = 0; i < 10; i++) {
          const tokenId = tokenIds[i];
          await expect(assetWrapper.connect(user).depositERC721(mockERC721.address, tokenId, bundleId))
            .to.emit(mockERC721, "Transfer")
            .withArgs(await user.getAddress(), assetWrapper.address, tokenId)
            .to.emit(assetWrapper, "DepositERC721")
            .withArgs(await user.getAddress(), bundleId, mockERC721.address, tokenId);

          const holdingsData = await assetWrapper.bundleERC721Holdings(bundleId, i);
          expect(holdingsData.tokenAddress).to.equal(mockERC721.address);
          expect(holdingsData.tokenId).to.equal(tokenId);
        }
      });

      it("should accept deposits from multiple ERC721 tokens", async () => {
        const { assetWrapper, user } = await setupTestContext();
        const bundleId = await initializeBundle(assetWrapper, user);

        for (let i = 0; i < 10; i++) {
          const mockERC721 = <MockERC721>await deploy("MockERC721", user, ["Mock ERC721", "MOCK" + i]);

          const tokenId = await mintERC721(mockERC721, user);
          await approveERC721(mockERC721, user, assetWrapper.address, tokenId);

          await expect(assetWrapper.connect(user).depositERC721(mockERC721.address, tokenId, bundleId))
            .to.emit(mockERC721, "Transfer")
            .withArgs(await user.getAddress(), assetWrapper.address, tokenId)
            .to.emit(assetWrapper, "DepositERC721")
            .withArgs(await user.getAddress(), bundleId, mockERC721.address, tokenId);

          const holdingsData = await assetWrapper.bundleERC721Holdings(bundleId, i);
          expect(holdingsData.tokenAddress).to.equal(mockERC721.address);
          expect(holdingsData.tokenId).to.equal(tokenId);
        }
      });
    });

    describe("ERC1155", () => {
      it("should accept deposit from an ERC1155 NFT", async () => {
        const { assetWrapper, mockERC1155, user } = await setupTestContext();
        const amount = BigNumber.from("1");

        const tokenId = await mintERC1155(mockERC1155, user, amount);
        await approveERC1155(mockERC1155, user, assetWrapper.address);

        const bundleId = await initializeBundle(assetWrapper, user);

        await expect(assetWrapper.connect(user).depositERC1155(mockERC1155.address, tokenId, amount, bundleId))
          .to.emit(mockERC1155, "TransferSingle")
          .withArgs(assetWrapper.address, await user.getAddress(), assetWrapper.address, tokenId, amount)
          .to.emit(assetWrapper, "DepositERC1155")
          .withArgs(await user.getAddress(), bundleId, mockERC1155.address, tokenId, amount);

        const holdingsData = await assetWrapper.bundleERC1155Holdings(bundleId, 0);
        expect(holdingsData.tokenAddress).to.equal(mockERC1155.address);
        expect(holdingsData.tokenId).to.equal(tokenId);
        expect(holdingsData.amount).to.equal(amount);
      });

      it("should accept deposit from an ERC1155 fungible token", async () => {
        const { assetWrapper, mockERC1155, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseEther("10");

        const tokenId = await mintERC1155(mockERC1155, user, amount);
        await approveERC1155(mockERC1155, user, assetWrapper.address);

        const bundleId = await initializeBundle(assetWrapper, user);

        await expect(assetWrapper.connect(user).depositERC1155(mockERC1155.address, tokenId, amount, bundleId))
          .to.emit(mockERC1155, "TransferSingle")
          .withArgs(assetWrapper.address, await user.getAddress(), assetWrapper.address, tokenId, amount)
          .to.emit(assetWrapper, "DepositERC1155")
          .withArgs(await user.getAddress(), bundleId, mockERC1155.address, tokenId, amount);

        const holdingsData = await assetWrapper.bundleERC1155Holdings(bundleId, 0);
        expect(holdingsData.tokenAddress).to.equal(mockERC1155.address);
        expect(holdingsData.tokenId).to.equal(tokenId);
        expect(holdingsData.amount).to.equal(amount);
      });

      it("should throw when depositing into uninitialized bundle", async () => {
        const { assetWrapper, mockERC1155, user } = await setupTestContext();
        const amount = BigNumber.from("1");

        const tokenId = await mintERC1155(mockERC1155, user, amount);
        const bundleId = BigNumber.from("1005432");

        await expect(
          assetWrapper.connect(user).depositERC1155(mockERC1155.address, tokenId, amount, bundleId),
        ).to.be.revertedWith("Bundle does not exist");
      });

      it("should throw when not approved", async () => {
        const { assetWrapper, mockERC1155, user } = await setupTestContext();
        const amount = BigNumber.from("1");

        const tokenId = await mintERC1155(mockERC1155, user, amount);
        const bundleId = await initializeBundle(assetWrapper, user);

        await expect(
          assetWrapper.connect(user).depositERC1155(mockERC1155.address, tokenId, amount, bundleId),
        ).to.be.revertedWith("ERC1155: caller is not owner nor approved");
      });

      it("should accept multiple deposits from an ERC1155 token", async () => {
        const { assetWrapper, mockERC1155, user } = await setupTestContext();
        const bundleId = await initializeBundle(assetWrapper, user);
        const amount = BigNumber.from("1");

        for (let i = 0; i < 10; i++) {
          const tokenId = await mintERC1155(mockERC1155, user, amount);
          await approveERC1155(mockERC1155, user, assetWrapper.address);

          await expect(assetWrapper.connect(user).depositERC1155(mockERC1155.address, tokenId, amount, bundleId))
            .to.emit(mockERC1155, "TransferSingle")
            .withArgs(assetWrapper.address, await user.getAddress(), assetWrapper.address, tokenId, amount)
            .to.emit(assetWrapper, "DepositERC1155")
            .withArgs(await user.getAddress(), bundleId, mockERC1155.address, tokenId, amount);

          const holdingsData = await assetWrapper.bundleERC1155Holdings(bundleId, i);
          expect(holdingsData.tokenAddress).to.equal(mockERC1155.address);
          expect(holdingsData.tokenId).to.equal(tokenId);
          expect(holdingsData.amount).to.equal(amount);
        }
      });

      it("should accept deposits from multiple ERC1155 tokens", async () => {
        const { assetWrapper, user } = await setupTestContext();
        const bundleId = await initializeBundle(assetWrapper, user);
        const amount = BigNumber.from("1");

        for (let i = 0; i < 10; i++) {
          const mockERC1155 = <MockERC1155>await deploy("MockERC1155", user, []);

          const tokenId = await mintERC1155(mockERC1155, user, amount);
          await approveERC1155(mockERC1155, user, assetWrapper.address);

          await expect(assetWrapper.connect(user).depositERC1155(mockERC1155.address, tokenId, amount, bundleId))
            .to.emit(mockERC1155, "TransferSingle")
            .withArgs(assetWrapper.address, await user.getAddress(), assetWrapper.address, tokenId, amount)
            .to.emit(assetWrapper, "DepositERC1155")
            .withArgs(await user.getAddress(), bundleId, mockERC1155.address, tokenId, amount);

          const holdingsData = await assetWrapper.bundleERC1155Holdings(bundleId, i);
          expect(holdingsData.tokenAddress).to.equal(mockERC1155.address);
          expect(holdingsData.tokenId).to.equal(tokenId);
          expect(holdingsData.amount).to.equal(amount);
        }
      });
    });

    describe("ETH", () => {
      it("should accept deposit of ETH", async () => {
        const { assetWrapper, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseEther("50");

        const bundleId = await initializeBundle(assetWrapper, user);

        await expect(assetWrapper.connect(user).depositETH(bundleId, { value: amount }))
          .to.emit(assetWrapper, "DepositETH")
          .withArgs(await user.getAddress(), bundleId, amount);

        const holdings = await assetWrapper.bundleETHHoldings(bundleId);
        expect(holdings).to.equal(amount);
      });

      it("should accept multiple deposits of ETH", async () => {
        const { assetWrapper, user } = await setupTestContext();
        const bundleId = await initializeBundle(assetWrapper, user);

        let total = BigNumber.from(0);
        for (let i = 1; i <= 10; i++) {
          const amount = hre.ethers.utils.parseEther(i.toString());
          await expect(assetWrapper.connect(user).depositETH(bundleId, { value: amount }))
            .to.emit(assetWrapper, "DepositETH")
            .withArgs(await user.getAddress(), bundleId, amount);
          total = total.add(amount);
        }

        const holdings = await assetWrapper.bundleETHHoldings(bundleId);
        expect(holdings).to.equal(total);
      });

      it("should throw when depositing into uninitialized bundle", async () => {
        const { assetWrapper, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseEther("50");

        const bundleId = BigNumber.from("1005432");

        await expect(assetWrapper.connect(user).depositETH(bundleId, { value: amount })).to.be.revertedWith(
          "Bundle does not exist",
        );
      });
    });
  });

  describe("Withdraw", () => {
    describe("ERC20", () => {
      /**
       * Set up a withdrawal test by depositing some ERC20s into a bundle
       */
      const deposit = async (
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

      /**
       * Set up a withdrawal test by initializing a bundle and depositing some ERC20s
       */
      const initializeAndDeposit = async (
        token: MockERC20,
        assetWrapper: AssetWrapper,
        amount: BigNumber,
        user: Signer,
      ) => {
        const bundleId = await initializeBundle(assetWrapper, user);
        await deposit(token, assetWrapper, amount, user, bundleId);
        return bundleId;
      };

      it("should withdraw single deposit from a bundle", async () => {
        const { assetWrapper, mockERC20, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseUnits("50", 18);
        const bundleId = await initializeAndDeposit(mockERC20, assetWrapper, amount, user);

        await expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId)
          .to.emit(mockERC20, "Transfer")
          .withArgs(assetWrapper.address, await user.getAddress(), amount);
      });

      it("should withdraw multiple deposits of the same token from a bundle", async () => {
        const { assetWrapper, mockERC20, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseUnits("50", 18);
        const bundleId = await initializeAndDeposit(mockERC20, assetWrapper, amount, user);
        const secondAmount = hre.ethers.utils.parseUnits("14", 18);
        await deposit(mockERC20, assetWrapper, secondAmount, user, bundleId);

        await expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId)
          .to.emit(mockERC20, "Transfer")
          .withArgs(assetWrapper.address, await user.getAddress(), amount)
          .to.emit(mockERC20, "Transfer")
          .withArgs(assetWrapper.address, await user.getAddress(), secondAmount);
      });

      it("should withdraw deposits of multiple tokens from a bundle", async () => {
        const { assetWrapper, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseUnits("50", 18);
        const bundleId = await initializeBundle(assetWrapper, user);

        const tokens = [];
        for (let i = 0; i < 10; i++) {
          const mockERC20 = <MockERC20>await deploy("MockERC20", user, ["Mock ERC20", "MOCK" + i]);
          await deposit(mockERC20, assetWrapper, amount, user, bundleId);
          tokens.push(mockERC20);
        }

        let expectation = expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId);

        for (const token of tokens) {
          expectation = expectation.to
            .emit(token, "Transfer")
            .withArgs(assetWrapper.address, await user.getAddress(), amount);
        }
        await expectation;
      });

      it("should throw when already withdrawn", async () => {
        const { assetWrapper, mockERC20, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseUnits("50", 18);
        const bundleId = await initializeAndDeposit(mockERC20, assetWrapper, amount, user);

        await expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId)
          .to.emit(mockERC20, "Transfer")
          .withArgs(assetWrapper.address, await user.getAddress(), amount);

        await expect(assetWrapper.connect(user).withdraw(bundleId)).to.be.revertedWith(
          "ERC721: operator query for nonexistent token",
        );
      });

      it("should throw when withdraw called by non-owner", async () => {
        const { assetWrapper, mockERC20, user, other } = await setupTestContext();
        const amount = hre.ethers.utils.parseUnits("50", 18);
        const bundleId = await initializeAndDeposit(mockERC20, assetWrapper, amount, user);

        await expect(assetWrapper.connect(other).withdraw(bundleId)).to.be.revertedWith(
          "AssetWrapper: Non-owner withdrawal",
        );
      });

      it("should withdraw when non-owner calls with approval", async () => {
        const { assetWrapper, mockERC20, user, other } = await setupTestContext();
        const amount = hre.ethers.utils.parseUnits("50", 18);
        const bundleId = await initializeAndDeposit(mockERC20, assetWrapper, amount, user);

        await assetWrapper.connect(user).approve(await other.getAddress(), bundleId);
        await expect(assetWrapper.connect(other).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await other.getAddress(), bundleId)
          .to.emit(mockERC20, "Transfer")
          .withArgs(assetWrapper.address, await other.getAddress(), amount);
      });

      it("should throw when non-owner calls with approval to AssetWrapper", async () => {
        const { assetWrapper, mockERC20, user, other } = await setupTestContext();
        const amount = hre.ethers.utils.parseUnits("50", 18);
        const bundleId = await initializeAndDeposit(mockERC20, assetWrapper, amount, user);

        await assetWrapper.connect(user).approve(assetWrapper.address, bundleId);
        await expect(assetWrapper.connect(other).withdraw(bundleId)).to.be.revertedWith(
          "AssetWrapper: Non-owner withdrawal",
        );
      });
    });

    describe("ERC721", () => {
      /**
       * Set up a withdrawal test by depositing some ERC721s into a bundle
       */
      const initializeAndDeposit = async (token: MockERC721, assetWrapper: AssetWrapper, user: Signer) => {
        const bundleId = await initializeBundle(assetWrapper, user);
        const tokenId = await mintERC721(token, user);
        await approveERC721(token, user, assetWrapper.address, tokenId);
        await assetWrapper.connect(user).depositERC721(token.address, tokenId, bundleId);
        return { tokenId, bundleId };
      };

      it("should withdraw single deposit from a bundle", async () => {
        const { assetWrapper, mockERC721, user } = await setupTestContext();
        const { tokenId, bundleId } = await initializeAndDeposit(mockERC721, assetWrapper, user);

        await expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId)
          .to.emit(mockERC721, "Transfer")
          .withArgs(assetWrapper.address, await user.getAddress(), tokenId)
          .to.emit(mockERC721, "Approval")
          .withArgs(assetWrapper.address, ZERO_ADDRESS, tokenId);
      });

      it("should throw when already withdrawn", async () => {
        const { assetWrapper, mockERC721, user } = await setupTestContext();
        const { tokenId, bundleId } = await initializeAndDeposit(mockERC721, assetWrapper, user);

        await expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId)
          .to.emit(mockERC721, "Transfer")
          .withArgs(assetWrapper.address, await user.getAddress(), tokenId)
          .to.emit(mockERC721, "Approval")
          .withArgs(assetWrapper.address, ZERO_ADDRESS, tokenId);

        await expect(assetWrapper.connect(user).withdraw(bundleId)).to.be.revertedWith(
          "ERC721: operator query for nonexistent token",
        );
      });

      it("should throw when withdraw called by non-owner", async () => {
        const { assetWrapper, mockERC721, user, other } = await setupTestContext();
        const { bundleId } = await initializeAndDeposit(mockERC721, assetWrapper, user);

        await expect(assetWrapper.connect(other).withdraw(bundleId)).to.be.revertedWith(
          "AssetWrapper: Non-owner withdrawal",
        );
      });

      it("should withdraw when non-owner calls with approval", async () => {
        const { assetWrapper, mockERC721, user, other } = await setupTestContext();
        const { tokenId, bundleId } = await initializeAndDeposit(mockERC721, assetWrapper, user);

        await assetWrapper.connect(user).approve(await other.getAddress(), bundleId);
        await expect(assetWrapper.connect(other).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await other.getAddress(), bundleId)
          .to.emit(mockERC721, "Transfer")
          .withArgs(assetWrapper.address, await other.getAddress(), tokenId)
          .to.emit(mockERC721, "Approval")
          .withArgs(assetWrapper.address, ZERO_ADDRESS, tokenId);
      });

      it("should throw when non-owner calls with approval to AssetWrapper", async () => {
        const { assetWrapper, mockERC721, user, other } = await setupTestContext();
        const { bundleId } = await initializeAndDeposit(mockERC721, assetWrapper, user);

        await assetWrapper.connect(user).approve(assetWrapper.address, bundleId);
        await expect(assetWrapper.connect(other).withdraw(bundleId)).to.be.revertedWith(
          "AssetWrapper: Non-owner withdrawal",
        );
      });
    });

    describe("ERC1155", () => {
      /**
       * Set up a withdrawal test by depositing some ERC1155s into a bundle
       */
      const initializeAndDeposit = async (
        token: MockERC1155,
        assetWrapper: AssetWrapper,
        user: Signer,
        amount: BigNumber,
      ) => {
        const bundleId = await initializeBundle(assetWrapper, user);
        const tokenId = await mintERC1155(token, user, amount);
        await approveERC1155(token, user, assetWrapper.address);
        await assetWrapper.connect(user).depositERC1155(token.address, tokenId, amount, bundleId);
        return { tokenId, bundleId };
      };

      it("should withdraw single deposit from a bundle", async () => {
        const { assetWrapper, mockERC1155, user } = await setupTestContext();
        const amount = BigNumber.from("1");
        const { tokenId, bundleId } = await initializeAndDeposit(mockERC1155, assetWrapper, user, amount);

        await expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId)
          .to.emit(mockERC1155, "TransferSingle")
          .withArgs(assetWrapper.address, assetWrapper.address, await user.getAddress(), tokenId, amount);
      });

      it("should withdraw fungible deposit from a bundle", async () => {
        const { assetWrapper, mockERC1155, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseEther("100");
        const { tokenId, bundleId } = await initializeAndDeposit(mockERC1155, assetWrapper, user, amount);

        await expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId)
          .to.emit(mockERC1155, "TransferSingle")
          .withArgs(assetWrapper.address, assetWrapper.address, await user.getAddress(), tokenId, amount);
      });

      it("should throw when already withdrawn", async () => {
        const { assetWrapper, mockERC1155, user } = await setupTestContext();
        const amount = BigNumber.from("1");
        const { tokenId, bundleId } = await initializeAndDeposit(mockERC1155, assetWrapper, user, amount);

        await expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId)
          .to.emit(mockERC1155, "TransferSingle")
          .withArgs(assetWrapper.address, assetWrapper.address, await user.getAddress(), tokenId, amount);

        await expect(assetWrapper.connect(user).withdraw(bundleId)).to.be.revertedWith(
          "ERC721: operator query for nonexistent token",
        );
      });

      it("should throw when withdraw called by non-owner", async () => {
        const { assetWrapper, mockERC1155, user, other } = await setupTestContext();
        const amount = BigNumber.from("1");
        const { bundleId } = await initializeAndDeposit(mockERC1155, assetWrapper, user, amount);

        await expect(assetWrapper.connect(other).withdraw(bundleId)).to.be.revertedWith(
          "AssetWrapper: Non-owner withdrawal",
        );
      });

      it("should withdraw when non-owner calls with approval", async () => {
        const { assetWrapper, mockERC1155, user, other } = await setupTestContext();
        const amount = BigNumber.from("1");
        const { tokenId, bundleId } = await initializeAndDeposit(mockERC1155, assetWrapper, user, amount);

        await assetWrapper.connect(user).approve(await other.getAddress(), bundleId);
        await expect(assetWrapper.connect(other).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await other.getAddress(), bundleId)
          .to.emit(mockERC1155, "TransferSingle")
          .withArgs(assetWrapper.address, assetWrapper.address, await other.getAddress(), tokenId, amount);
      });

      it("should throw when non-owner calls with approval to AssetWrapper", async () => {
        const { assetWrapper, mockERC1155, user, other } = await setupTestContext();
        const amount = BigNumber.from("1");
        const { bundleId } = await initializeAndDeposit(mockERC1155, assetWrapper, user, amount);

        await assetWrapper.connect(user).approve(assetWrapper.address, bundleId);
        await expect(assetWrapper.connect(other).withdraw(bundleId)).to.be.revertedWith(
          "AssetWrapper: Non-owner withdrawal",
        );
      });
    });

    describe("ETH", () => {
      const deposit = async (assetWrapper: AssetWrapper, user: Signer, amount: BigNumber, bundleId: BigNumber) => {
        await assetWrapper.connect(user).depositETH(bundleId, { value: amount });
      };

      /**
       * Set up a withdrawal test by initializing and depositing some ETH into a bundle
       */
      const initializeAndDeposit = async (assetWrapper: AssetWrapper, user: Signer, amount: BigNumber) => {
        const bundleId = await initializeBundle(assetWrapper, user);
        await deposit(assetWrapper, user, amount, bundleId);
        return bundleId;
      };

      it("should withdraw single deposit from a bundle", async () => {
        const { assetWrapper, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseEther("123");
        const bundleId = await initializeAndDeposit(assetWrapper, user, amount);
        const startingBalance = BigNumber.from(
          await hre.network.provider.send("eth_getBalance", [await user.getAddress(), "latest"]),
        );

        await expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId);

        const threshold = hre.ethers.utils.parseEther("0.001"); // for txn fee
        const endingBalance = BigNumber.from(
          await hre.network.provider.send("eth_getBalance", [await user.getAddress(), "latest"]),
        );
        expect(endingBalance.sub(startingBalance).gt(amount.sub(threshold))).to.be.true;
      });

      it("should throw when already withdrawn", async () => {
        const { assetWrapper, user } = await setupTestContext();
        const amount = hre.ethers.utils.parseEther("14");
        const bundleId = await initializeAndDeposit(assetWrapper, user, amount);

        await expect(assetWrapper.connect(user).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await user.getAddress(), bundleId);

        await expect(assetWrapper.connect(user).withdraw(bundleId)).to.be.revertedWith(
          "ERC721: operator query for nonexistent token",
        );
      });

      it("should throw when withdraw called by non-owner", async () => {
        const { assetWrapper, user, other } = await setupTestContext();
        const amount = hre.ethers.utils.parseEther("9");
        const bundleId = await initializeAndDeposit(assetWrapper, user, amount);

        await expect(assetWrapper.connect(other).withdraw(bundleId)).to.be.revertedWith(
          "AssetWrapper: Non-owner withdrawal",
        );
      });

      it("should withdraw when non-owner calls with approval", async () => {
        const { assetWrapper, user, other } = await setupTestContext();
        const amount = hre.ethers.utils.parseEther("94");
        const bundleId = await initializeAndDeposit(assetWrapper, user, amount);

        await assetWrapper.connect(user).approve(await other.getAddress(), bundleId);
        await expect(assetWrapper.connect(other).withdraw(bundleId))
          .to.emit(assetWrapper, "Withdraw")
          .withArgs(await other.getAddress(), bundleId);
      });

      it("should throw when non-owner calls with approval to AssetWrapper", async () => {
        const { assetWrapper, user, other } = await setupTestContext();
        const amount = hre.ethers.utils.parseEther("64");
        const bundleId = await initializeAndDeposit(assetWrapper, user, amount);

        await assetWrapper.connect(user).approve(assetWrapper.address, bundleId);
        await expect(assetWrapper.connect(other).withdraw(bundleId)).to.be.revertedWith(
          "AssetWrapper: Non-owner withdrawal",
        );
      });
    });
  });

  describe("ERC721", () => {
    let token: AssetWrapper;
    let user: Signer, other: Signer, signers: Signer[];

    context("with minted tokens", function () {
      beforeEach(async () => {
        const { assetWrapper, user: userSigner, other: otherSigner, signers: otherSigners } = await setupTestContext();
        user = userSigner;
        other = otherSigner;
        token = assetWrapper;
        signers = otherSigners;
      });

      describe("balanceOf", function () {
        context("when the given address owns some tokens", function () {
          it("returns the amount of tokens owned by the given address", async function () {
            await initializeBundle(token, user);
            await initializeBundle(token, user);
            expect(await token.balanceOf(await user.getAddress())).to.equal(BigNumber.from("2"));
          });
        });

        context("when the given address does not own any tokens", function () {
          it("returns 0", async function () {
            expect(await token.balanceOf(await other.getAddress())).to.equal(BigNumber.from("0"));
          });
        });

        context("when querying the zero address", function () {
          it("throws", async function () {
            await expect(token.balanceOf(ZERO_ADDRESS)).to.be.revertedWith(
              "ERC721: balance query for the zero address",
            );
          });
        });
      });

      describe("ownerOf", function () {
        context("when the given token ID was tracked by this token", function () {
          it("returns the owner of the given token ID", async function () {
            const tokenId = await initializeBundle(token, user);
            expect(await token.ownerOf(tokenId)).to.be.equal(await user.getAddress());
          });
        });

        context("when the given token ID was not tracked by this token", function () {
          it("reverts", async function () {
            await expect(token.ownerOf(BigNumber.from("123412341234"))).to.be.revertedWith(
              "ERC721: owner query for nonexistent token",
            );
          });
        });
      });

      describe("transfers", function () {
        describe("transferFrom", function () {
          const testTransfer = async (
            token: AssetWrapper,
            from: Signer,
            to: Signer,
            caller: Signer,
            tokenId: BigNumber,
          ) => {
            const preSenderBalance = await token.balanceOf(await from.getAddress());
            const preRecipientBalance = await token.balanceOf(await to.getAddress());
            await expect(token.connect(caller).transferFrom(await from.getAddress(), await to.getAddress(), tokenId))
              .to.emit(token, "Transfer")
              .withArgs(await from.getAddress(), await to.getAddress(), tokenId)
              .to.emit(token, "Approval")
              .withArgs(await from.getAddress(), ZERO_ADDRESS, tokenId);

            expect(await token.ownerOf(tokenId)).to.equal(await to.getAddress());
            expect(await token.getApproved(tokenId)).to.equal(ZERO_ADDRESS);
            const postSenderBalance = await token.balanceOf(await from.getAddress());
            const postRecipientBalance = await token.balanceOf(await to.getAddress());
            expect(postSenderBalance).to.equal(preSenderBalance.sub(1));
            expect(postRecipientBalance).to.equal(preRecipientBalance.add(1));

            if (postSenderBalance.gt(0)) {
              expect(await token.tokenOfOwnerByIndex(await from.getAddress(), 0)).to.not.equal(tokenId);
            } else {
              await expect(token.tokenOfOwnerByIndex(await from.getAddress(), 0)).to.be.revertedWith(
                "ERC721Enumerable: owner index out of bounds",
              );
            }

            if (postRecipientBalance.gt(0)) {
              expect(await token.tokenOfOwnerByIndex(await to.getAddress(), 0)).to.equal(tokenId);
            } else {
              await expect(token.tokenOfOwnerByIndex(await to.getAddress(), 0)).to.be.revertedWith(
                "ERC721Enumerable: owner index out of bounds",
              );
            }
          };

          it("succeeds when called by owner", async () => {
            const tokenId = await initializeBundle(token, user);
            await testTransfer(token, user, other, user, tokenId);
          });

          it("succeeds when called by approved user", async () => {
            const approved = signers[0];
            const tokenId = await initializeBundle(token, user);
            await token.connect(user).approve(await approved.getAddress(), tokenId);
            await testTransfer(token, user, other, approved, tokenId);
          });

          it("succeeds when called by an operator", async () => {
            const operator = signers[1];
            const tokenId = await initializeBundle(token, user);
            await token.connect(user).setApprovalForAll(await operator.getAddress(), true);
            await testTransfer(token, user, other, operator, tokenId);
          });

          describe("properly performs a self-send", async () => {
            let tokenId: BigNumber;

            beforeEach(async () => {
              tokenId = await initializeBundle(token, user);
              await expect(token.connect(user).transferFrom(await user.getAddress(), await user.getAddress(), tokenId))
                .to.emit(token, "Transfer")
                .withArgs(await user.getAddress(), await user.getAddress(), tokenId)
                .to.emit(token, "Approval")
                .withArgs(await user.getAddress(), ZERO_ADDRESS, tokenId);
            });

            it("keeps ownership of the token", async function () {
              expect(await token.ownerOf(tokenId)).to.equal(await user.getAddress());
            });

            it("clears the approval for the token ID", async function () {
              expect(await token.getApproved(tokenId)).to.equal(ZERO_ADDRESS);
            });

            it("keeps the owner balance", async function () {
              expect(await token.balanceOf(await user.getAddress())).to.equal(BigNumber.from("1"));
            });
          });

          it("fails when the owner address is incorrect", async () => {
            const tokenId = await initializeBundle(token, user);
            await expect(
              token.connect(user).transferFrom(await other.getAddress(), await other.getAddress(), tokenId),
            ).to.be.revertedWith("ERC721: transfer of token that is not own");
          });

          it("fails when the sender is not authorized", async () => {
            const tokenId = await initializeBundle(token, user);
            await expect(
              token.connect(other).transferFrom(await user.getAddress(), await other.getAddress(), tokenId),
            ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
          });

          it("fails when the token id does not exist", async () => {
            const nonexistentTokenId = BigNumber.from("123412341243");
            await expect(
              token.connect(user).transferFrom(await user.getAddress(), await other.getAddress(), nonexistentTokenId),
            ).to.be.revertedWith("ERC721: operator query for nonexistent token");
          });

          it("fails when the recipient is the zero address", async () => {
            const tokenId = await initializeBundle(token, user);
            await expect(
              token.connect(user).transferFrom(await user.getAddress(), ZERO_ADDRESS, tokenId),
            ).to.be.revertedWith("zero");
          });
        });
      });
    });
  });
});
