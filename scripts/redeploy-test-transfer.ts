/* eslint no-unused-vars: 0 */

import hre, { ethers } from "hardhat";

import { main as deploy } from "./redeploy-loancore";
import { main as transferOwnership } from "./transfer-ownership";
import {
    getBalance,
    deployNFTs,
    mintAndDistribute,
    SECTION_SEPARATOR,
    wrapAssetsAndMakeLoans,
} from "./bootstrap-tools";

export async function main(): Promise<void> {
    // Bootstrap five accounts only.
    // Skip the first account, since the
    // first signer will be the deployer.
    const allSigners = await ethers.getSigners();
    const [deployer, ...signers] = allSigners.slice(0, 6);
    const adminAddress = process.env.ADMIN_ADDRESS || allSigners[10].address;

    console.log(SECTION_SEPARATOR);
    console.log("Deploying resources...\n");

    // Deploy the smart contracts
    const { assetWrapper, originationControllerV2, repaymentControllerV2, borrowerNote, loanCore } = await deploy();

    // Mint some NFTs
    console.log(SECTION_SEPARATOR);
    const { punks, art, beats, weth, pawnToken, usd } = await deployNFTs();

    // Distribute NFTs and ERC20s
    console.log(SECTION_SEPARATOR);
    console.log("Distributing assets...\n");
    await mintAndDistribute(signers, weth, pawnToken, usd, punks, art, beats);

    // Wrap some assets
    console.log(SECTION_SEPARATOR);
    console.log("Wrapping assets...\n");
    await wrapAssetsAndMakeLoans(
        signers,
        assetWrapper,
        originationController,
        borrowerNote,
        repaymentControllerV2,
        punks,
        usd,
        beats,
        weth,
        art,
        pawnToken,
    );

    console.log("Transferring ownership...\n");

    // Transfer ownership and try to withdraw fees
    await transferOwnership(loanCoreV2.address, adminAddress);

    console.log("Testing permissions...\n");

    // Try to have deployer withdraw
    try {
        await loanCoreV2.connect(deployer.address).claimFees(weth.address);
        throw new Error("<Unexpected> Deployer fee claim did not revert!");
    } catch (e) {
        if ((e as Error).message.includes("<Unexpected>")) throw e;
        console.log("Deployer fee claim reverted.");
    }

    // Try to have deployer pause
    try {
        await loanCoreV2.connect(deployer.address).pause();
        throw new Error("<Unexpected> Deployer pause did not revert!");
    } catch (e) {
        if ((e as Error).message.includes("<Unexpected>")) throw e;
        console.log("Deployer pause reverted.");
    }

    // Have admin withdraw
    await deployer.sendTransaction({
        value: ethers.utils.parseEther("1"),
        to: adminAddress,
    });

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [adminAddress],
    });
    const adminSigner = await ethers.getSigner(adminAddress);

    console.log(`Loan core balance pre-withdraw: ${await getBalance(weth, loanCoreV2.address)}`);
    console.log(`Fee claimer balance pre-withdraw: ${await getBalance(weth, adminAddress)}`);
    await loanCoreV2.connect(adminSigner).claimFees(weth.address);
    console.log(`Loan core balance post-withdraw: ${await getBalance(weth, loanCoreV2.address)}`);
    console.log(`Fee claimer balance post-withdraw: ${await getBalance(weth, adminAddress)}`);
    console.log(`Admin successfully withdrew fees.`);

    // Have admin pause
    await loanCoreV2.connect(adminSigner).pause();
    await loanCoreV2.connect(adminSigner).unpause();
    console.log(`Admin successfully paused and unpaused contract.`);

    console.log(SECTION_SEPARATOR);
    console.log("Ownership transfer complete!");
    console.log(SECTION_SEPARATOR);
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
