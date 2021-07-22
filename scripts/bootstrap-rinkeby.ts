/* eslint no-unused-vars: 0 */

import { ethers } from "hardhat";

import { main as deploy } from "./deploy";
import { deployNFTs, mintAndDistribute, SECTION_SEPARATOR } from "./bootstrap-tools";

export async function main(): Promise<void> {
    // Meant to be run on the rinkeby network.
    // These addresses are owned by PawnFi team members
    // on Rinkeby.
    // Bootstrap five accounts only.
    // Skip the first account, since the
    // first signer will be the deployer.
    const recipients = [
        '0xb36e019914618ad663b1278f0DA6f137c8e7D069', // John
        '0x28CC3688b316E65AB9cC6B93Dc3bfaBdaAe57E06', // Carl
        '0xb22EB63e215Ba39F53845c7aC172a7139f20Ea13', // Rob
    ];

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
    await mintAndDistribute(recipients, weth, pawnToken, usd, punks, art, beats);
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
