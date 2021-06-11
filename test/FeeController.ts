import { expect } from "chai";
import hre from "hardhat";
import { Signer } from "ethers";
import { FeeController } from "../typechain";
import { deploy } from "./utils/contracts";

interface TestContext {
  feeController: FeeController;
  user: Signer;
  other: Signer;
  signers: Signer[];
}

describe("FeeController", () => {
  const setupTestContext = async (): Promise<TestContext> => {
    const signers: Signer[] = await hre.ethers.getSigners();
    const feeController = <FeeController>await deploy("FeeController", signers[0], []);

    return {
      feeController,
      user: signers[0],
      other: signers[1],
      signers: signers.slice(2),
    };
  };

  describe("constructor", () => {
    it("creates Fee Controller", async () => {
      const signers: Signer[] = await hre.ethers.getSigners();
      expect(await deploy("FeeController", signers[0], []));
    });

    describe("setOriginationFee", () => {
      it("reverts if sender does not have admin role", async () => {
        const { feeController, other } = await setupTestContext();
        await expect(feeController.connect(other).setOriginationFee(1234)).to.be.reverted;
      });

      it("sets origination fee", async () => {
        const { feeController, user } = await setupTestContext();
        await expect(feeController.connect(user).setOriginationFee(1234))
          .to.emit(feeController, "UpdateOriginationFee")
          .withArgs(1234);
      });
    });

    describe("getOriginationFee", () => {
      it("initially returns 3%", async () => {
        const { feeController, user } = await setupTestContext();
        const originationFee = await feeController.connect(user).getOriginationFee();
        expect(originationFee).to.equal(300);
      });

      it("returns updated origination fee after set", async () => {
        const { feeController, user } = await setupTestContext();
        const newFee = 200;

        await feeController.connect(user).setOriginationFee(newFee);

        const originationFee = await feeController.connect(user).getOriginationFee();
        expect(originationFee).to.equal(newFee);
      });
    });
  });
});
