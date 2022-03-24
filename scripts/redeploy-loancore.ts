import { ethers } from "hardhat";

import {
    AssetWrapper,
    FeeController,
    LoanCoreV2,
    PromissoryNote,
    RepaymentControllerV2,
    OriginationController,
} from "../typechain";

import { ORIGINATOR_ROLE as DEFAULT_ORIGINATOR_ROLE, REPAYER_ROLE as DEFAULT_REPAYER_ROLE } from "./constants";

import { SECTION_SEPARATOR } from "./bootstrap-tools";

/**
 *  October 2021: LoanCoreV2 Redeploy
 *  This deploy addresses the issue of AssetWrapper re-use.
 *  The following contracts need to be re-deployed for any LoanCoreV2 change:
 *      - LoanCoreV2
 *      - BorrowerNote (implicit)
 *      - LenderNote (implicit)
 *      - OriginationController (LoanCoreV2 address is immutable)
 *      - RepaymentControllerV2 (LoanCoreV2 address is immutable)
 *
 */

export interface DeployedResources {
    assetWrapper: AssetWrapper;
    feeController: FeeController;
    LoanCoreV2: LoanCoreV2V2;
    borrowerNote: PromissoryNote;
    lenderNote: PromissoryNote;
    RepaymentControllerV2: RepaymentControllerV2;
    originationController: OriginationController;
}

export async function main(
    ORIGINATOR_ROLE = DEFAULT_ORIGINATOR_ROLE,
    REPAYER_ROLE = DEFAULT_REPAYER_ROLE,
    ASSET_WRAPPER_ADDRESS = "0x1F563CDd688ad47b75E474FDe74E87C643d129b7",
    FEE_CONTROLLER_ADDRESS = "0xfc2b8D5C60c8E8BbF8d6dc685F03193472e39587",
): Promise<DeployedResources> {
    console.log(SECTION_SEPARATOR);
    const signers = await ethers.getSigners();
    console.log("Deployer address: ", signers[0].address);
    console.log("Deployer balance: ", (await signers[0].getBalance()).toString());
    console.log(SECTION_SEPARATOR);

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
    const LoanCoreV2Factory = await ethers.getContractFactory("LoanCoreV2");
    const LoanCoreV2 = <LoanCoreV2>await LoanCoreV2Factory.deploy(ASSET_WRAPPER_ADDRESS, FEE_CONTROLLER_ADDRESS);
    await LoanCoreV2.deployed();

    const promissoryNoteFactory = await ethers.getContractFactory("PromissoryNote");
    const borrowerNoteAddr = await LoanCoreV2.borrowerNote();
    const borrowerNote = <PromissoryNote>await promissoryNoteFactory.attach(borrowerNoteAddr);
    const lenderNoteAddr = await LoanCoreV2.lenderNote();
    const lenderNote = <PromissoryNote>await promissoryNoteFactory.attach(lenderNoteAddr);

    console.log("LoanCoreV2 deployed to:", LoanCoreV2.address);
    console.log("BorrowerNote deployed to:", borrowerNoteAddr);
    console.log("LenderNote deployed to:", lenderNoteAddr);

    const RepaymentControllerV2Factory = await ethers.getContractFactory("RepaymentControllerV2");
    const RepaymentControllerV2 = <RepaymentControllerV2>(
        await RepaymentControllerV2Factory.deploy(LoanCoreV2.address, borrowerNoteAddr, lenderNoteAddr)
    );
    await RepaymentControllerV2.deployed();
    const updateRepaymentControllerV2Permissions = await LoanCoreV2.grantRole(REPAYER_ROLE, RepaymentControllerV2.address);
    await updateRepaymentControllerV2Permissions.wait();

    console.log("RepaymentControllerV2 deployed to:", RepaymentControllerV2.address);

    const OriginationControllerFactory = await ethers.getContractFactory("OriginationController");
    const originationController = <OriginationController>(
        await OriginationControllerFactory.deploy(LoanCoreV2.address, ASSET_WRAPPER_ADDRESS)
    );
    await originationController.deployed();
    const updateOriginationControllerPermissions = await LoanCoreV2.grantRole(
        ORIGINATOR_ROLE,
        originationController.address,
    );
    await updateOriginationControllerPermissions.wait();

    console.log("OriginationController deployed to:", originationController.address);

    return {
        assetWrapper,
        feeController,
        LoanCoreV2,
        borrowerNote,
        lenderNote,
        RepaymentControllerV2,
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
