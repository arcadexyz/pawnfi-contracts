import { Contract } from "ethers";
import { ethers } from "hardhat";

export interface DeployedResources {
  assetWrapper: Contract;
  feeController: Contract;
  loanCore: Contract;
  borrowerNote: Contract;
  lenderNote: Contract;
  repaymentController: Contract;
  originationController: Contract;
  punkRouter: Contract;
}

export async function main(
  ORIGINATOR_ROLE = "0x59abfac6520ec36a6556b2a4dd949cc40007459bcd5cd2507f1e5cc77b6bc97e",
  REPAYER_ROLE = "0x9c60024347074fd9de2c1e36003080d22dbc76a41ef87444d21e361bcb39118e",
  WRAPPED_PUNKS = "0xb7F7F6C52F2e2fdb1963Eab30438024864c313F6",
  CRYPTO_PUNKS = "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb",
): Promise<DeployedResources> {
  // Hardhat always runs the compile task when running scripts through it.
  // If this runs in a standalone fashion you may want to call compile manually
  // to make sure everything is compiled
  // await run("compile");

  // We get the contract to deploy
  const AssetWrapper = await ethers.getContractFactory("AssetWrapper");
  const assetWrapper = await AssetWrapper.deploy("AssetWrapper", "AW");
  await assetWrapper.deployed();

  console.log("AssetWrapper deployed to:", assetWrapper.address);

  const FeeController = await ethers.getContractFactory("FeeController");
  const feeController = await FeeController.deploy();
  await feeController.deployed();

  console.log("FeeController deployed to: ", feeController.address);

  const LoanCore = await ethers.getContractFactory("LoanCore");
  const loanCore = await LoanCore.deploy(assetWrapper.address, feeController.address);
  await loanCore.deployed();

  const promissoryNoteFactory = await ethers.getContractFactory("PromissoryNote");
  const borrowerNoteAddr = await loanCore.borrowerNote();
  const borrowerNote = await promissoryNoteFactory.attach(borrowerNoteAddr);
  const lenderNoteAddr = await loanCore.lenderNote();
  const lenderNote = await promissoryNoteFactory.attach(lenderNoteAddr);

  console.log("LoanCore deployed to:", loanCore.address);
  console.log("BorrowerNote deployed to:", borrowerNoteAddr);
  console.log("LenderNote deployed to:", lenderNoteAddr);

  const RepaymentController = await ethers.getContractFactory("RepaymentController");
  const repaymentController = await RepaymentController.deploy(loanCore.address, borrowerNoteAddr, lenderNoteAddr);
  await repaymentController.deployed();
  const updateRepaymentControllerPermissions = await loanCore.grantRole(REPAYER_ROLE, repaymentController.address);
  await updateRepaymentControllerPermissions.wait();

  console.log("RepaymentController deployed to:", repaymentController.address);

  const OriginationController = await ethers.getContractFactory("OriginationController");
  const originationController = await OriginationController.deploy(loanCore.address, assetWrapper.address);
  await originationController.deployed();
  const updateOriginationControllerPermissions = await loanCore.grantRole(
    ORIGINATOR_ROLE,
    originationController.address,
  );
  await updateOriginationControllerPermissions.wait();

  console.log("OriginationController deployed to:", originationController.address);

  const PunkRouter = await ethers.getContractFactor("PunkRouter");
  const punkRouter = await PunkRouter.deploy(assetWrapper.address, WRAPPED_PUNKS, CRYPTO_PUNKS);
  await punkRouter.deployed();

  console.log("PunkRouter deployed to:", punkRouter.address);

  return {
    assetWrapper,
    feeController,
    loanCore,
    borrowerNote,
    lenderNote,
    repaymentController,
    originationController,
    punkRouter,
  };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
    });
}
