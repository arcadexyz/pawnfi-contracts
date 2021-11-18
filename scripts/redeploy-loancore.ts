import { ethers } from "hardhat";

import {
    AssetWrapper,
    FeeController,
    LoanCore,
    PromissoryNote,
    RepaymentController,
    OriginationController,
} from "../typechain";

import { ORIGINATOR_ROLE as DEFAULT_ORIGINATOR_ROLE, REPAYER_ROLE as DEFAULT_REPAYER_ROLE } from "./constants";

/**
 *  October 2021: LoanCore Redeploy
 *  This deploy addresses the issue of AssetWrapper re-use.
 *  The following contracts need to be re-deployed for any LoanCore change:
 *      - LoanCore
 *      - BorrowerNote (implicit)
 *      - LenderNote (implicit)
 *      - OriginationController (LoanCore address is immutable)
 *      - RepaymentController (LoanCore address is immutable)
 *
 */

export interface DeployedResources {
    assetWrapper: AssetWrapper;
    feeController: FeeController;
    loanCore: LoanCore;
    borrowerNote: PromissoryNote;
    lenderNote: PromissoryNote;
    repaymentController: RepaymentController;
    originationController: OriginationController;
}

export async function main(
    ORIGINATOR_ROLE = DEFAULT_ORIGINATOR_ROLE,
    REPAYER_ROLE = DEFAULT_REPAYER_ROLE,
    ASSET_WRAPPER_ADDRESS = "0x1F563CDd688ad47b75E474FDe74E87C643d129b7",
    FEE_CONTROLLER_ADDRESS = "0xfc2b8D5C60c8E8BbF8d6dc685F03193472e39587",
): Promise<DeployedResources> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");

    // Attach to existing contracts
    const AssetWrapperFactory = await ethers.getContractFactory("AssetWrapper");
    const assetWrapper = <AssetWrapper>await AssetWrapperFactory.attach(ASSET_WRAPPER_ADDRESS);

    const FeeControllerFactory = await ethers.getContractFactory("FeeController");
    const feeController = <FeeController>await FeeControllerFactory.attach(FEE_CONTROLLER_ADDRESS);

    // Start deploying new contracts
    const LoanCoreFactory = await ethers.getContractFactory("LoanCore");
    const loanCore = <LoanCore>await LoanCoreFactory.deploy(ASSET_WRAPPER_ADDRESS, FEE_CONTROLLER_ADDRESS);
    await loanCore.deployed();

    const promissoryNoteFactory = await ethers.getContractFactory("PromissoryNote");
    const borrowerNoteAddr = await loanCore.borrowerNote();
    const borrowerNote = <PromissoryNote>await promissoryNoteFactory.attach(borrowerNoteAddr);
    const lenderNoteAddr = await loanCore.lenderNote();
    const lenderNote = <PromissoryNote>await promissoryNoteFactory.attach(lenderNoteAddr);

    console.log("LoanCore deployed to:", loanCore.address);
    console.log("BorrowerNote deployed to:", borrowerNoteAddr);
    console.log("LenderNote deployed to:", lenderNoteAddr);

    const RepaymentControllerFactory = await ethers.getContractFactory("RepaymentController");
    const repaymentController = <RepaymentController>(
        await RepaymentControllerFactory.deploy(loanCore.address, borrowerNoteAddr, lenderNoteAddr)
    );
    await repaymentController.deployed();
    const updateRepaymentControllerPermissions = await loanCore.grantRole(REPAYER_ROLE, repaymentController.address);
    await updateRepaymentControllerPermissions.wait();

    console.log("RepaymentController deployed to:", repaymentController.address);

    const OriginationControllerFactory = await ethers.getContractFactory("OriginationController");
    const originationController = <OriginationController>(
        await OriginationControllerFactory.deploy(loanCore.address, ASSET_WRAPPER_ADDRESS)
    );
    await originationController.deployed();
    const updateOriginationControllerPermissions = await loanCore.grantRole(
        ORIGINATOR_ROLE,
        originationController.address,
    );
    await updateOriginationControllerPermissions.wait();

    console.log("OriginationController deployed to:", originationController.address);

    return {
        assetWrapper,
        feeController,
        loanCore,
        borrowerNote,
        lenderNote,
        repaymentController,
        originationController,
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
