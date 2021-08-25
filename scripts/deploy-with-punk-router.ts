import { Contract } from "ethers";
import { ethers } from "hardhat";

import { main as deployMain, DeployedResources } from './deploy';

export interface DeployedResourcesWithPunks extends DeployedResources {
  punkRouter: Contract
}

export async function main(
  ORIGINATOR_ROLE = "0x59abfac6520ec36a6556b2a4dd949cc40007459bcd5cd2507f1e5cc77b6bc97e",
  REPAYER_ROLE = "0x9c60024347074fd9de2c1e36003080d22dbc76a41ef87444d21e361bcb39118e",
  WRAPPED_PUNKS = "0xb7F7F6C52F2e2fdb1963Eab30438024864c313F6",
  CRYPTO_PUNKS = "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb",
): Promise<DeployedResourcesWithPunks> {
    const {
      assetWrapper,
      feeController,
      loanCore,
      borrowerNote,
      lenderNote,
      repaymentController,
      originationController,
    } = await deployMain(ORIGINATOR_ROLE, REPAYER_ROLE);

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
