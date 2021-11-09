/* eslint no-unused-vars: 0 */

import hre, { ethers } from "hardhat";

import { LoanTerms } from "../test/utils/types";
import { createLoanTermsSignature } from "../test/utils/eip712";

import { main as deploy } from "./deploy";
import { main as redeploy } from "./redeploy-loancore";
import { main as deployFlashRollover } from "./deploy-flash-rollover";
import { deployNFTs, mintAndDistribute, SECTION_SEPARATOR } from "./bootstrap-tools";
import { ORIGINATOR_ROLE, REPAYER_ROLE } from "./constants";
import { MockERC20 } from "../typechain";

export async function main(): Promise<void> {
    // Bootstrap five accounts only.
    // Skip the first account, since the
    // first signer will be the deployer.
    const [, ...signers] = (await ethers.getSigners()).slice(0, 6);

    console.log(SECTION_SEPARATOR);
    console.log("Deploying resources...\n");

    // Deploy the smart contracts
    const legacyContracts = await deploy();
    const { assetWrapper, feeController } = legacyContracts;
    const currentContracts = await redeploy(
        ORIGINATOR_ROLE,
        REPAYER_ROLE,
        assetWrapper.address,
        feeController.address
    );

    const { flashRollover } = await deployFlashRollover(
        "0xb53c1a33016b2dc2ff3653530bff1848a515c8c5",
        currentContracts.loanCore.address,
        legacyContracts.loanCore.address,
        currentContracts.originationController.address,
        currentContracts.repaymentController.address,
        legacyContracts.repaymentController.address,
        currentContracts.borrowerNote.address,
        legacyContracts.borrowerNote.address,
        currentContracts.lenderNote.address,
        legacyContracts.lenderNote.address,
        assetWrapper.address,
        feeController.address
    );

    // Mint some NFTs
    console.log(SECTION_SEPARATOR);
    const { punks, art, beats, weth, pawnToken, usd } = await deployNFTs();

    // Distribute NFTs and ERC20s
    console.log(SECTION_SEPARATOR);
    console.log("Distributing assets...\n");
    await mintAndDistribute(signers, weth, pawnToken, usd, punks, art, beats);

    // Also distribute USDC by impersonating a large account
    const WHALE = "0xe78388b4ce79068e89bf8aa7f218ef6b9ab0e9d0";
    const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
    await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [WHALE],
    });

    const whaleSigner = await hre.ethers.getSigner(WHALE);

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const usdc = <MockERC20>await MockERC20Factory.attach(USDC_ADDRESS);
    const realWeth = <MockERC20>await MockERC20Factory.attach(WETH_ADDRESS);

    // Send USDC to lenders
    await realWeth.connect(whaleSigner).transfer(signers[2].address, ethers.utils.parseEther("500"));
    await usdc.connect(whaleSigner).transfer(signers[3].address, ethers.utils.parseUnits("1000000", 6));

    // Wrap some assets and create 2 bundles - one for legacy and one for new contract
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

    await usd.connect(signer1).approve(aw1.address, ethers.utils.parseUnits("1000", 6));
    await aw1.depositERC20(usd.address, ethers.utils.parseUnits("1000", 6), aw1Bundle1Id);
    console.log(`(Bundle 1) Signer ${signer1.address} created a bundle with 1 PawnFiPunk and 1000 PUSD`);

    // Deposit 1 punk and 2 beats edition 0 for bundle 2
    await aw1.initializeBundle(signer1.address);
    const aw1Bundle2Id = await aw1.tokenOfOwnerByIndex(signer1.address, 1);
    const aw1Punk2Id = await punks.tokenOfOwnerByIndex(signer1.address, 1);

    await punks.connect(signer1).approve(aw1.address, aw1Punk2Id);
    await aw1.depositERC721(punks.address, aw1Punk2Id, aw1Bundle2Id);

    await beats.connect(signer1).setApprovalForAll(aw1.address, true);
    await aw1.depositERC1155(beats.address, 0, 2, aw1Bundle2Id);
    console.log(`(Bundle 2) Signer ${signer1.address} created a bundle with 1 PawnFiPunk ands 2 PawnBeats Edition 0`);

    console.log(SECTION_SEPARATOR);
    console.log("Initializing loan with old LoanCore...\n");

    // Start some loans
    // TODO: Do loans in USDC so that AAVE has reserves
    const signer2 = signers[2];
    const oneDayMs = 1000 * 60 * 60 * 24;
    const oneWeekMs = oneDayMs * 7;

    const relSecondsFromMs = (msToAdd: number) => Math.floor(msToAdd / 1000);

    // 1 will borrow from 2
    const loan1Terms: LoanTerms = {
        durationSecs: relSecondsFromMs(oneWeekMs),
        principal: ethers.utils.parseEther("10"),
        interest: ethers.utils.parseEther("1.5"),
        collateralTokenId: aw1Bundle1Id,
        payableCurrency: realWeth.address,
    };

    const {
        v: loan1V,
        r: loan1R,
        s: loan1S,
    } = await createLoanTermsSignature(legacyContracts.originationController.address, "OriginationController", loan1Terms, signer1);

    await realWeth.connect(signer2).approve(legacyContracts.originationController.address, ethers.utils.parseEther("10"));
    await assetWrapper.connect(signer1).approve(legacyContracts.originationController.address, aw1Bundle1Id);

    // Borrower signed, so lender will initialize
    const loan1Tx = await legacyContracts.originationController
        .connect(signer2)
        .initializeLoan(loan1Terms, signer1.address, signer2.address, loan1V, loan1R, loan1S);
    await loan1Tx.wait();

    const event1Filter = legacyContracts.loanCore.filters.LoanStarted(null, null, null);
    const loan1Events = await legacyContracts.loanCore.queryFilter(event1Filter, "latest");
    const loan1LoanId = loan1Events[0].args?.loanId;

    if (!loan1LoanId) {
        throw new Error('Could not get loan 1 ID from events.');
    }

    console.log(
        `(Loan 1) Signer ${signer1.address} borrowed 10 WETH at 15% interest from ${signer2.address} against Bundle 1 using LoanCore at ${legacyContracts.loanCore.address}`,
    );

    console.log(SECTION_SEPARATOR);
    console.log("Initializing loan with new LoanCore...\n");

    const signer3 = signers[3];

    const loan2Terms: LoanTerms = {
        durationSecs: relSecondsFromMs(oneWeekMs) - 10,
        principal: ethers.utils.parseUnits("10000", 6),
        interest: ethers.utils.parseUnits("500", 6),
        collateralTokenId: aw1Bundle2Id,
        payableCurrency: usdc.address,
    };

    const {
        v: loan2V,
        r: loan2R,
        s: loan2S,
    } = await createLoanTermsSignature(currentContracts.originationController.address, "OriginationController", loan2Terms, signer1);

    await usdc.connect(signer3).approve(currentContracts.originationController.address, ethers.utils.parseEther("10000"));
    await assetWrapper.connect(signer1).approve(currentContracts.originationController.address, aw1Bundle2Id);

    // Borrower signed, so lender will initialize
    const loan2Tx = await currentContracts.originationController
        .connect(signer3)
        .initializeLoan(loan2Terms, signer1.address, signer3.address, loan2V, loan2R, loan2S);
    await loan2Tx.wait();

    const event2Filter = currentContracts.loanCore.filters.LoanStarted(null, null, null);
    const loan2Events = await currentContracts.loanCore.queryFilter(event2Filter, "latest");
    const loan2LoanId = loan2Events[0].args?.loanId;

    if (!loan2LoanId) {
        throw new Error('Could not get loan 2 ID from events.');
    }

    console.log(
        `(Loan 2) Signer ${signer1.address} borrowed 10000 PAWN at 5% interest from ${signer3.address} against Bundle 2 using LoanCore at ${currentContracts.loanCore.address}`,
    );

    // Roll over both loans
    console.log(SECTION_SEPARATOR);
    console.log("Rolling over old loan...\n");

    // Rolling over loan 1 (lender signs now)
    const loan1RolloverTerms: LoanTerms = {
        durationSecs: relSecondsFromMs(oneWeekMs),
        principal: ethers.utils.parseEther("30"),
        interest: ethers.utils.parseEther("3"),
        collateralTokenId: aw1Bundle1Id,
        payableCurrency: realWeth.address,
    };

    const {
        v: loan1RolloverV,
        r: loan1RolloverR,
        s: loan1RolloverS,
    } = await createLoanTermsSignature(currentContracts.originationController.address, "OriginationController", loan1RolloverTerms, signer2);

    // Approve the rollover contract to take borrower note
    const loan1Data = await legacyContracts.loanCore.getLoan(loan1LoanId);
    const loan1BorrowerNoteId = loan1Data.borrowerNoteId;
    await legacyContracts.borrowerNote.connect(signer1).approve(flashRollover.address, loan1BorrowerNoteId);

    // Approve the rollover contract to withdraw funds from lender
    await realWeth.connect(signer2).approve(
        currentContracts.originationController.address,
        ethers.utils.parseEther("100000")
    );

    await flashRollover.connect(signer1).rolloverLoan(
        true,
        loan1LoanId,
        loan1RolloverTerms,
        loan1RolloverV,
        loan1RolloverR,
        loan1RolloverS
    );

    // Roll over both loans
    console.log(SECTION_SEPARATOR);
    console.log("Rolling over new loan...\n");

    // Rolling over loan 1 (lender signs now)
    const loan2RolloverTerms: LoanTerms = {
        durationSecs: relSecondsFromMs(oneWeekMs) - 10,
        principal: ethers.utils.parseUnits("9000", 6),
        interest: ethers.utils.parseUnits("500", 6),
        collateralTokenId: aw1Bundle2Id,
        payableCurrency: usdc.address,
    };

    const {
        v: loan2RolloverV,
        r: loan2RolloverR,
        s: loan2RolloverS,
    } = await createLoanTermsSignature(currentContracts.originationController.address, "OriginationController", loan2RolloverTerms, signer3);

    // Approve the rollover contract to take borrower note
    const loan2Data = await currentContracts.loanCore.getLoan(loan1LoanId);
    const loan2BorrowerNoteId = loan2Data.borrowerNoteId;
    await currentContracts.borrowerNote.connect(signer1).approve(flashRollover.address, loan2BorrowerNoteId);

    // Approve the rollover contract to withdraw funds from lender
    await usdc.connect(signer3).approve(
        currentContracts.originationController.address,
        ethers.utils.parseEther("100000")
    );

    // Approve the rollover contract to withdraw balance from borrower
    await usdc.connect(signer1).approve(
        flashRollover.address,
        ethers.utils.parseEther("100000")
    );

    await flashRollover.connect(signer1).rolloverLoan(
        false,
        loan2LoanId,
        loan2RolloverTerms,
        loan2RolloverV,
        loan2RolloverR,
        loan2RolloverS
    );

    // Roll over both loans
    console.log(SECTION_SEPARATOR);
    console.log("Rollover successful.\n");
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
