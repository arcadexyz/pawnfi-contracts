/* eslint no-unused-vars: 0 */

import { ethers } from "hardhat";

import { main as deploy } from "./deploy";
import { deployNFTs, mintAndDistribute, SECTION_SEPARATOR, wrapAssetsAndMakeLoans } from "./bootstrap-tools";
import { AssetWrapper, OriginationController, RepaymentController, PromissoryNote } from "../typechain";

export async function main(
    ASSET_WRAPPER_ADDRESS = "0x1F563CDd688ad47b75E474FDe74E87C643d129b7",
    ORIGINATION_CONTROLLER_ADDRESS = "0x7C2A27485B69f490945943464541236a025161F6",
    REPAYMENT_CONTROLLER_ADDRESS = "0x9eCE636e942bCb67f9E0b7B6C51A56570EF6F38d",
    BORROWER_NOTE_ADDRESS = "0xe00B37ad3a165A66C20cA3E0170e4749c20eF58c"
): Promise<void> {
    // Bootstrap five accounts only.
    // Skip the first account, since the
    // first signer will be the deployer.
    const [, ...signers] = (await ethers.getSigners()).slice(0, 6);

    console.log(SECTION_SEPARATOR);
    console.log("Deploying resources...\n");

    // Attach to mainnet smart contracts
    const AssetWrapperFactory = await ethers.getContractFactory("AssetWrapper");
    const assetWrapper = <AssetWrapper>await AssetWrapperFactory.attach(ASSET_WRAPPER_ADDRESS);

    const OriginationControllerFactory = await ethers.getContractFactory("OriginationController");
    const originationController = <OriginationController>await OriginationControllerFactory.attach(ORIGINATION_CONTROLLER_ADDRESS);

    const RepaymentControllerFactory = await ethers.getContractFactory("RepaymentController");
    const repaymentController = <RepaymentController>await RepaymentControllerFactory.attach(REPAYMENT_CONTROLLER_ADDRESS);

    const BorrowerNoteFactory = await ethers.getContractFactory("PromissoryNote");
    const borrowerNote = <PromissoryNote>await BorrowerNoteFactory.attach(BORROWER_NOTE_ADDRESS);

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
        repaymentController,
        punks,
        usd,
        beats,
        weth,
        art,
        pawnToken,
    );

    // End state:
    // 0 is clean (but has a bunch of tokens and NFTs)
    // 1 has 2 bundles and 1 open borrow, one closed borrow
    // 2 has two open lends and one closed lend
    // 3 has 3 bundles, two open borrows, one closed borrow, and one closed lend
    // 4 has 1 bundle, an unused bundle, one open lend and one open borrow
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
