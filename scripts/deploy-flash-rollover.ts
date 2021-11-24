import { ethers } from "hardhat";

import { FlashRollover } from "../typechain";

import { SECTION_SEPARATOR } from "./bootstrap-tools";

export interface DeployedResources {
    flashRollover: FlashRollover;
}

// TODO: Set arguments once a new loan core is deployed.
export async function main(
    ADDRESSES_PROVIDER_ADDRESS = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
): Promise<DeployedResources> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");

    console.log(SECTION_SEPARATOR);
    const signers = await ethers.getSigners();
    console.log("Deployer address: ", signers[0].address);
    console.log("Deployer balance: ", (await signers[0].getBalance()).toString());
    console.log(SECTION_SEPARATOR);

    const FlashRolloverFactory = await ethers.getContractFactory("FlashRollover");
    console.log("deploying", ADDRESSES_PROVIDER_ADDRESS);
    const flashRollover = <FlashRollover>await FlashRolloverFactory.deploy(ADDRESSES_PROVIDER_ADDRESS);

    await flashRollover.deployed();

    console.log("FlashRollover deployed to:", flashRollover.address);

    return { flashRollover };
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
