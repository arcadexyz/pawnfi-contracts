/* eslint no-unused-vars: 0 */

import { Contract } from "ethers";
import { ethers } from "hardhat";

import { main as deploy } from "./deploy";

const SECTION_SEPARATOR = "\n" + "=".repeat(80) + "\n"
const SUBSECTION_SEPARATOR = "-".repeat(10);

export async function main(): Promise<void> {
    // Bootstrap five accounts only.
    // Skip the first account, since the 
    // first signer will be the deployer.
    const [deployer, ...signers] = (await ethers.getSigners()).slice(0, 6);

    console.log(SECTION_SEPARATOR);
    console.log("Deploying resources...");
    const {
        assetWrapper
    } = await deploy();

    // Mint some NFTs
    console.log(SECTION_SEPARATOR);
    console.log("Deploying NFTs...");
    const erc721Factory = await ethers.getContractFactory("ERC721PresetMinterPauserAutoId");
    const erc1155Factory = await ethers.getContractFactory("ERC1155PresetMinterPauser");

    const punks = await erc721Factory.deploy("PawnFiPunks", "PFPUNKS", "");
    console.log("(ERC721) PawnFiPunks deployed to:", punks.address);

    const art = await erc721Factory.deploy("PawnArt.io", "PWART", "");
    console.log("(ERC721) PawnArt.io deployed to:", art.address);

    const beats = await erc1155Factory.deploy("");
    console.log("(ERC1155) PawnBeats deployed to:", beats.address);

    // Mint some ERC20s
    console.log(SECTION_SEPARATOR);
    console.log("Deploying Tokens...")
    const erc20Factory = await ethers.getContractFactory("ERC20PresetMinterPauser");

    const weth = await erc20Factory.deploy("Wrapped Ether", "WETH");
    console.log("(ERC20) WETH deployed to:", weth.address);

    const pawnToken = await erc20Factory.deploy("PawnToken", "PAWN");
    console.log("(ERC20) PAWN deployed to:", pawnToken.address);

    const usd = await erc20Factory.deploy("USD Stabecloin", "PUSD");
    console.log("(ERC20) PUSD deployed to:", usd.address);

    // Distribute NFTs and ERC20s
    console.log(SECTION_SEPARATOR);
    console.log("Distributing assets...");

    async function mintTokens(target: string, [wethAmount, pawnAmount, usdAmount]: [number, number, number]) {
        const mints = [
            weth.mint(target, ethers.utils.parseEther(wethAmount.toString())),
            pawnToken.mint(target, ethers.utils.parseEther(pawnAmount.toString())),
            usd.mint(target, ethers.utils.parseEther(usdAmount.toString()))
        ];
        
        await Promise.all(mints);
    }

    async function mintNFTs(target: string, [numPunks, numArts, numBeats0, numBeats1]: [number, number, number, number]) {
        const mints = [];

        for (let i = 0; i < numPunks; i++) {
            mints.push(punks.mint(target))
        }

        for (let i = 0; i < numArts; i++) {
            mints.push(art.mint(target))
        }

        mints.push(beats.mintBatch(target, [0, 1], [numBeats0, numBeats1], "0x00"))

        await Promise.all(mints);
    }

    // Give a bunch of everything to signer[0]
    await mintTokens(signers[0].address, [1000, 500000, 2000000]);
    await mintNFTs(signers[0].address, [20, 20, 20, 20]);

    // Give a mix to signers[1] through signers[5]
    await mintTokens(signers[1].address, [0, 2000, 10000]);
    await mintNFTs(signers[1].address, [5, 0, 2, 1]);

    await mintTokens(signers[2].address, [450, 0.5, 5000]);
    await mintNFTs(signers[2].address, [0, 0, 1, 0]);

    await mintTokens(signers[3].address, [2, 50000, 7777]);
    await mintNFTs(signers[3].address, [10, 3, 7, 0]);
    
    await mintTokens(signers[4].address, [50, 2222.2, 12.1]);
    await mintNFTs(signers[4].address, [1, 12, 1, 6]);

    
    console.log(SECTION_SEPARATOR);
    console.log("Initial balances:");
    for (const i in signers) {
        const signer = signers[i];
        const { address: signerAddr } = signer;

        console.log(SUBSECTION_SEPARATOR)
        console.log(`Signer ${i}: ${signerAddr}`);
        console.log("PawnPunks balance:", await getBalance(punks, signerAddr));
        console.log("PawnArt balance:", await getBalance(art, signerAddr));
        console.log("PawnBeats Edition 0 balance:", await getBalanceERC1155(beats, 0, signerAddr));
        console.log("PawnBeats Edition 1 balance:", await getBalanceERC1155(beats, 1, signerAddr));
        console.log("ETH balance:", (await signer.getBalance()).toString());
        console.log("WETH balance:", await getBalance(weth, signerAddr));
        console.log("PAWN balance:", await getBalance(pawnToken, signerAddr));
        console.log("PUSD balance:", await getBalance(usd, signerAddr));
    }    

    // Wrap some assets
    console.log(SECTION_SEPARATOR);
    console.log("Wrapping assets...");
    
    let signer = signers[1];
    const aw1 = await assetWrapper.connect(signer);
    
    // Deposit 1 punk and 1000 usd for bundle 1
    await aw1.initializeBundle(signer.address);
    const aw1Bundle1Id = await aw1.tokenOfOwnerByIndex(signer.address, 0);
    const aw1Punk1Id = await punks.tokenOfOwnerByIndex(signer.address, 0);

    await aw1.depositERC721(punks.address, aw1Punk1Id, aw1Bundle1Id);
    await aw1.depositERC20(usd.address, ethers.utils.parseEther("1000"), aw1Bundle1Id);
    console.log(`Signer ${signer.address} created a bundle with 1 PawnFiPunk and 1000 PUSD`);

    // Deposit 1 punk and 2 beats edition 0 for bundle 2
    await aw1.initializeBundle(signer.address);
    const aw1Bundle2Id = await aw1.tokenOfOwnerByIndex(signer.address, 1);
    const aw1Punk2Id = await punks.tokenOfOwnerByIndex(signer.address, 1);

    await aw1.depositERC721(punks.address, aw1Punk2Id, aw1Bundle2Id);
    console.log(`Signer ${signer.address} created a bundle with 1 PawnFiPunk 2 PawnBeats Edition 0`);

    const aw3 = await assetWrapper.connect(signers[3]);
    await aw3.initializeBundle(signers[3].address);

    // Deposit 2 punks and 1 weth for bundle 1
    // Deposit 1 punk for bundle 2
    // Deposit 1 art, 4 beats edition 0, and 2000 usd for bundle 3

    const aw4 = await assetWrapper.connect(signers[4]);
    await aw4.initializeBundle(signers[4].address);

    // Deposit 3 arts and 1000 pawn for bundle 1
    // Deposit 1 punk and 1 beats edition 1 for bundle 2



    // Start some loans
    // 1 will borrow from 2
    // 1 will borrow from 3
    // 3 will borrow from 2
    // 3 will open a second loan from 2
    // 3 will also borrow from 4
    // 4 will borrow from 2

    // Payoff a couple loans (not all)
    // 1 will pay off loan from 3
    // 3 will pay off one loan from 2

    // End state:
    // 0 is clean
    // 1 has 2 bundles and 1 open borrow, one closed borrow
    // 2 has two open lends and one closed lend
    // 3 has 3 bundles, two open borrows, and one closed borrow
    // 4 has 1 bundle, an unused bundle, one open lend and one open borrow
}

async function getBalance(asset: Contract, addr: string): Promise<string> {
    return (await asset.balanceOf(addr)).toString();
}

async function getBalanceERC1155(asset: Contract, id: number, addr: string): Promise<string> {
    return (await asset.balanceOf(addr, id)).toString();
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
