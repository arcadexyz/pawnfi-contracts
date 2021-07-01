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
    console.log("Deploying resources...\n");
    const {
        assetWrapper
    } = await deploy();

    // Mint some NFTs
    console.log(SECTION_SEPARATOR);
    console.log("Deploying NFTs...\n");
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
    console.log("Deploying Tokens...\n")
    const erc20Factory = await ethers.getContractFactory("ERC20PresetMinterPauser");

    const weth = await erc20Factory.deploy("Wrapped Ether", "WETH");
    console.log("(ERC20) WETH deployed to:", weth.address);

    const pawnToken = await erc20Factory.deploy("PawnToken", "PAWN");
    console.log("(ERC20) PAWN deployed to:", pawnToken.address);

    const usd = await erc20Factory.deploy("USD Stabecloin", "PUSD");
    console.log("(ERC20) PUSD deployed to:", usd.address);

    // Distribute NFTs and ERC20s
    console.log(SECTION_SEPARATOR);
    console.log("Distributing assets...\n");

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
    console.log("Wrapping assets...\n");
    
    const signer1 = signers[1];
    const aw1 = await assetWrapper.connect(signer1);
    
    // Deposit 1 punk and 1000 usd for bundle 1
    await aw1.initializeBundle(signer1.address);
    const aw1Bundle1Id = await aw1.tokenOfOwnerByIndex(signer1.address, 0);
    const aw1Punk1Id = await punks.tokenOfOwnerByIndex(signer1.address, 0);

    await punks.connect(signer1).approve(aw1.address, aw1Punk1Id);
    await aw1.depositERC721(punks.address, aw1Punk1Id, aw1Bundle1Id);

    await usd.connect(signer1).approve(aw1.address, ethers.utils.parseEther("1000"));
    await aw1.depositERC20(usd.address, ethers.utils.parseEther("1000"), aw1Bundle1Id);
    console.log(`Signer ${signer1.address} created a bundle with 1 PawnFiPunk and 1000 PUSD`);

    // Deposit 1 punk and 2 beats edition 0 for bundle 2
    await aw1.initializeBundle(signer1.address);
    const aw1Bundle2Id = await aw1.tokenOfOwnerByIndex(signer1.address, 1);
    const aw1Punk2Id = await punks.tokenOfOwnerByIndex(signer1.address, 1);

    await punks.connect(signer1).approve(aw1.address, aw1Punk2Id);
    await aw1.depositERC721(punks.address, aw1Punk2Id, aw1Bundle2Id);

    await beats.connect(signer1).setApprovalForAll(aw1.address, true);
    await aw1.depositERC1155(beats.address, 0, 2, aw1Bundle2Id);
    console.log(`Signer ${signer1.address} created a bundle with 1 PawnFiPunk ands 2 PawnBeats Edition 0`);

    const signer3 = signers[3];
    const aw3 = await assetWrapper.connect(signer3);
    
    // Deposit 2 punks and 1 weth for bundle 1
    await aw3.initializeBundle(signer3.address);
    const aw3Bundle1Id = await aw3.tokenOfOwnerByIndex(signer3.address, 0);
    const aw3Punk1Id = await punks.tokenOfOwnerByIndex(signer3.address, 0);
    const aw3Punk2Id = await punks.tokenOfOwnerByIndex(signer3.address, 1);

    await punks.connect(signer3).approve(aw3.address, aw3Punk1Id);
    await punks.connect(signer3).approve(aw3.address, aw3Punk2Id);
    await aw3.depositERC721(punks.address, aw3Punk1Id, aw3Bundle1Id);
    await aw3.depositERC721(punks.address, aw3Punk2Id, aw3Bundle1Id);

    await weth.connect(signer3).approve(aw3.address, ethers.utils.parseEther("1"));
    await aw3.depositERC20(weth.address, ethers.utils.parseEther("1"), aw3Bundle1Id);
    console.log(`Signer ${signer3.address} created a bundle with 2 PawnFiPunks and 1 WETH`);

    // Deposit 1 punk for bundle 2
    await aw3.initializeBundle(signer3.address);
    const aw3Bundle2Id = await aw3.tokenOfOwnerByIndex(signer3.address, 1);
    const aw3Punk3Id = await punks.tokenOfOwnerByIndex(signer3.address, 2);

    await punks.connect(signer3).approve(aw3.address, aw3Punk3Id);
    await aw3.depositERC721(punks.address, aw3Punk3Id, aw3Bundle2Id);
    console.log(`Signer ${signer3.address} created a bundle with 1 PawnFiPunk`);

    // Deposit 1 art, 4 beats edition 0, and 2000 usd for bundle 3
    await aw3.initializeBundle(signer3.address);
    const aw3Bundle3Id = await aw3.tokenOfOwnerByIndex(signer3.address, 2);
    const aw3Art1Id = await art.tokenOfOwnerByIndex(signer3.address, 0);

    await art.connect(signer3).approve(aw3.address, aw3Art1Id);
    await aw3.depositERC721(art.address, aw3Art1Id, aw3Bundle3Id);

    await beats.connect(signer3).setApprovalForAll(aw3.address, true);
    await aw3.depositERC1155(beats.address, 0, 4, aw3Bundle3Id);

    await usd.connect(signer3).approve(aw3.address, ethers.utils.parseEther("2000"));
    await aw3.depositERC20(usd.address, ethers.utils.parseEther("2000"), aw3Bundle3Id);
    console.log(`Signer ${signer3.address} created a bundle with 1 PawnArt, 4 PawnBeats Edition 0, and 2000 PUSD`);

    const signer4 = signers[4];
    const aw4 = await assetWrapper.connect(signer4);
    
    // Deposit 3 arts and 1000 pawn for bundle 1
    await aw4.initializeBundle(signer4.address);
    const aw4Bundle1Id = await aw4.tokenOfOwnerByIndex(signer4.address, 0);
    const aw4Art1Id = await art.tokenOfOwnerByIndex(signer4.address, 0);
    const aw4Art2Id = await art.tokenOfOwnerByIndex(signer4.address, 1);
    const aw4Art3Id = await art.tokenOfOwnerByIndex(signer4.address, 2);

    await art.connect(signer4).approve(aw4.address, aw4Art1Id);
    await art.connect(signer4).approve(aw4.address, aw4Art2Id);
    await art.connect(signer4).approve(aw4.address, aw4Art3Id);
    await aw4.depositERC721(art.address, aw4Art1Id, aw4Bundle1Id);
    await aw4.depositERC721(art.address, aw4Art2Id, aw4Bundle1Id);
    await aw4.depositERC721(art.address, aw4Art3Id, aw4Bundle1Id);

    await pawnToken.connect(signer4).approve(aw4.address, ethers.utils.parseEther("1000"));
    await aw4.depositERC20(pawnToken.address, ethers.utils.parseEther("1000"), aw4Bundle1Id);
    console.log(`Signer ${signer4.address} created a bundle with 4 PawnArts and 1000 PAWN`);

    // Deposit 1 punk and 1 beats edition 1 for bundle 2
    await aw4.initializeBundle(signer4.address);
    const aw4Bundle2Id = await aw3.tokenOfOwnerByIndex(signer4.address, 1);
    const aw4Punk1Id = await punks.tokenOfOwnerByIndex(signer4.address, 0);

    await punks.connect(signer4).approve(aw4.address, aw4Punk1Id);
    await aw4.depositERC721(punks.address, aw4Punk1Id, aw4Bundle2Id);

    await beats.connect(signer4).setApprovalForAll(aw4.address, true);
    await aw4.depositERC1155(beats.address, 1, 1, aw4Bundle2Id);
    console.log(`Signer ${signer4.address} created a bundle with 1 PawnFiPunk and 1 PawnBeats Edition 1`);

    console.log(SECTION_SEPARATOR);
    console.log("Initializing loans...\n");

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
