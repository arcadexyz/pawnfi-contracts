/* eslint no-unused-vars: 0 */

import { ethers } from "hardhat";

import { main as deploy } from "./deploy";
import {
  deployNFTs,
  mintAndDistribute,
  SECTION_SEPARATOR,
} from "./bootstrap-tools";

export async function main(): Promise<void> {
  // Bootstrap five accounts only.
  // Skip the first account, since the
  // first signer will be the deployer.
  const [, ...signers] = (await ethers.getSigners()).slice(0, 6);

  console.log(SECTION_SEPARATOR);
  console.log("Deploying resources...\n");

  // Deploy the smart contracts
  await deploy();

  // Mint some NFTs
  console.log(SECTION_SEPARATOR);
  const { punks, art, beats, weth, pawnToken, usd } = await deployNFTs();

  // Distribute NFTs and ERC20s
  console.log(SECTION_SEPARATOR);
  console.log("Distributing assets...\n");
  await mintAndDistribute(signers, weth, pawnToken, usd, punks, art, beats);
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
