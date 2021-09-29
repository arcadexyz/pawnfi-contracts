import { expect } from "chai";
import hre from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";

import { AssetWrapper, PunkRouter, CryptoPunksMarket, WrappedPunk } from "../typechain";
import { deploy } from "./utils/contracts";

type Signer = SignerWithAddress;

interface TestContext {
  assetWrapper: AssetWrapper;
  punkRouter: PunkRouter;
  punks: CryptoPunksMarket;
  wrappedPunks: WrappedPunk;
  user: Signer;
  other: Signer;
  signers: Signer[];
}

interface TestContextForDepositStuck {
  owner: Signer;
  other: Signer;
  punks: CryptoPunksMarket;
  punkIndex: number;
  punkRouter: PunkRouter;
}

describe("PunkRouter", () => {
  /**
   * Sets up a test context, deploying new contracts and returning them for use in a test
   */
  const setupTestContext = async (): Promise<TestContext> => {
    const signers: Signer[] = await hre.ethers.getSigners();
    const punks = <CryptoPunksMarket>await deploy("CryptoPunksMarket", signers[0], []);
    const wrappedPunks = <WrappedPunk>await deploy("WrappedPunk", signers[0], [punks.address]);
    const assetWrapper = <AssetWrapper>await deploy("AssetWrapper", signers[0], ["AssetWrapper", "WRP"]);
    const punkRouter = <PunkRouter>(
      await deploy("PunkRouter", signers[0], [assetWrapper.address, wrappedPunks.address, punks.address])
    );

    return {
      assetWrapper,
      punks,
      wrappedPunks,
      punkRouter,
      user: signers[0],
      other: signers[1],
      signers: signers.slice(2),
    };
  };

  const setupTestContextForDepositStuck = async (): Promise<TestContextForDepositStuck> => {
    const { punks, punkRouter, user, other } = await setupTestContext();
    const punkIndex = 1234;
    // claim ownership of punk
    await punks.setInitialOwner(await user.getAddress(), punkIndex);
    await punks.allInitialOwnersAssigned();
    // simulate depositPunk and stucked after buyPunk
    await punks.connect(user).transferPunk(punkRouter.address, punkIndex);
    return {
      owner: user,
      other,
      punkIndex,
      punks,
      punkRouter,
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

  describe("Deposit CryptoPunk", function () {
    it("should successfully deposit a cryptopunk into bundle", async () => {
      const { assetWrapper, punks, wrappedPunks, punkRouter, user } = await setupTestContext();
      const punkIndex = 1234;
      // claim ownership of punk
      await punks.setInitialOwner(await user.getAddress(), punkIndex);
      await punks.allInitialOwnersAssigned();
      // "approve" the punk to the router
      await punks.offerPunkForSaleToAddress(punkIndex, 0, punkRouter.address);

      const bundleId = await initializeBundle(assetWrapper, user);
      await expect(punkRouter.depositPunk(punkIndex, bundleId))
        .to.emit(wrappedPunks, "Transfer")
        .withArgs(punkRouter.address, assetWrapper.address, punkIndex)
        .to.emit(assetWrapper, "DepositERC721")
        .withArgs(punkRouter.address, bundleId, wrappedPunks.address, punkIndex);

      const holdings = await assetWrapper.bundleERC721Holdings(bundleId, 0);
      expect(holdings.tokenAddress).to.equal(wrappedPunks.address);
      expect(holdings.tokenId).to.equal(punkIndex);
    });

    it("should fail if not approved", async () => {
      const { assetWrapper, punks, punkRouter, user } = await setupTestContext();
      const punkIndex = 1234;
      // claim ownership of punk
      await punks.setInitialOwner(await user.getAddress(), punkIndex);
      await punks.allInitialOwnersAssigned();
      // skip "approving" the punk to the router

      const bundleId = await initializeBundle(assetWrapper, user);
      await expect(punkRouter.depositPunk(punkIndex, bundleId)).to.be.reverted;
    });

    it("should fail if not owner", async () => {
      const { assetWrapper, punks, punkRouter, user, other } = await setupTestContext();
      const punkIndex = 1234;
      // claim ownership of punk
      await punks.setInitialOwner(await user.getAddress(), punkIndex);
      await punks.allInitialOwnersAssigned();
      // "approve" the punk to the router
      await punks.offerPunkForSaleToAddress(punkIndex, 0, punkRouter.address);

      const bundleId = await initializeBundle(assetWrapper, user);
      await expect(punkRouter.connect(other).depositPunk(punkIndex, bundleId)).to.be.revertedWith(
        "PunkRouter: not owner",
      );
    });
  });

  describe("Withdraw CryptoPunk held by PunkRouter", function () {
    it("should successfully withdraw punk", async () => {
      const { punks, punkRouter, owner, other, punkIndex } = await setupTestContextForDepositStuck();
      await expect(punkRouter.withdrawPunk(punkIndex, other.address))
        .to.emit(punks, "Transfer")
        .withArgs(punkRouter.address, other.address, 1)
        .to.emit(punks, "PunkTransfer")
        .withArgs(punkRouter.address, other.address, punkIndex);
    });

    it("should fail if not designated admin", async () => {
      const { punkRouter, owner, other, punkIndex } = await setupTestContextForDepositStuck();
      await expect(punkRouter.connect(other).withdrawPunk(punkIndex, owner.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });
});
