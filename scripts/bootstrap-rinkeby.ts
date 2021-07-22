/* eslint no-unused-vars: 0 */

import { ethers } from "hardhat";

import { main as deploy } from "./deploy";
import { MockERC1155, MockERC20, MockERC721 } from "../typechain";
import { mintAndDistributeRinkeby, SECTION_SEPARATOR } from "./bootstrap-tools";

export async function main(): Promise<void> {
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    // Meant to be run on the Rinkeby network.
    // These addresses are owned by PawnFi
    // team members on Rinkeby.
    if (!process.env.AIRDROP_RECIPIENTS) {
        throw new Error('Airdrop recipients not specified.');
    }

    const recipients = process.env.AIRDROP_RECIPIENTS.split(',');
    console.log("Recipients:", "\n", recipients.join('\n '));


    // Attach to existing ERC721s and ERC20s on Rinkeby
    const erc20Factory = await ethers.getContractFactory("ERC20PresetMinterPauser");
    const erc721Factory = await ethers.getContractFactory("ERC721PresetMinterPauserAutoId");
    const erc1155Factory = await ethers.getContractFactory("ERC1155PresetMinterPauser");

    const punks = <MockERC721>await erc721Factory.attach("0xfC58d979477DC11D90D3f995A5cCa1Cf5604B235");
    const art = <MockERC721>await erc721Factory.attach("0x8C0437cbA1C2539Fe3dAE7faB2c133996af70173");
    const beats = <MockERC1155>await erc1155Factory.attach("0x2FEB31Be1b5F1B01caBDed8bD614c260eBfDb1D2");

    const weth = <MockERC20>await erc20Factory.attach("0xf6E6FD3D83A83e40681D14392bcAdeD5a2aef433");
    const pawnToken = <MockERC20>await erc20Factory.attach("0xCe68FEac5907F4eE88513B98A4b19918E9F5c1a6");
    const usd = <MockERC20>await erc20Factory.attach("0xD4239ab75b29CE2aD3a049d2C01693fc8047c5f9");

    // Distribute NFTs and ERC20s
    console.log(SECTION_SEPARATOR);
    console.log("Distributing assets...\n");
    await mintAndDistributeRinkeby(recipients, weth, pawnToken, usd, punks, art, beats);
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
