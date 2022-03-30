import { ethers } from "hardhat";

import { ORIGINATOR_ROLE as DEFAULT_ORIGINATOR_ROLE, REPAYER_ROLE as DEFAULT_REPAYER_ROLE } from "./constants";

import {
    AssetWrapper,
    FeeController,
    LoanCoreV2,
    PromissoryNote,
    RepaymentControllerV2,
    OriginationController,
} from "../typechain";
export interface DeployedResources {
    assetWrapper: AssetWrapper;
    feeController: FeeController;
    loanCoreV2: LoanCoreV2;
    borrowerNote: PromissoryNote;
    lenderNote: PromissoryNote;
    repaymentControllerV2: RepaymentControllerV2;
    originationController: OriginationController;
}

export async function main(
    ORIGINATOR_ROLE = DEFAULT_ORIGINATOR_ROLE,
    REPAYER_ROLE = DEFAULT_REPAYER_ROLE,
): Promise<DeployedResources> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");

    // We get the contract to deploy
    const AssetWrapperFactory = await ethers.getContractFactory("AssetWrapper");
    const assetWrapper = <AssetWrapper>await AssetWrapperFactory.deploy("AssetWrapper", "AW");
    await assetWrapper.deployed();

    console.log("AssetWrapper deployed to:", assetWrapper.address);

    const FeeControllerFactory = await ethers.getContractFactory("FeeController");
    const feeController = <FeeController>await FeeControllerFactory.deploy();
    await feeController.deployed();

    console.log("FeeController deployed to: ", feeController.address);

    const LoanCoreV2Factory = await ethers.getContractFactory("LoanCoreV2");
    const loanCoreV2 = <LoanCoreV2>await LoanCoreV2Factory.deploy(assetWrapper.address, feeController.address);
    await loanCoreV2.deployed();

    const promissoryNoteFactory = await ethers.getContractFactory("PromissoryNote");
    const borrowerNoteAddr = await loanCoreV2.borrowerNote();
    const borrowerNote = <PromissoryNote>await promissoryNoteFactory.attach(borrowerNoteAddr);
    const lenderNoteAddr = await loanCoreV2.lenderNote();
    const lenderNote = <PromissoryNote>await promissoryNoteFactory.attach(lenderNoteAddr);

    console.log("LoanCoreV2 deployed to:", loanCoreV2.address);
    console.log("BorrowerNote deployed to:", borrowerNoteAddr);
    console.log("LenderNote deployed to:", lenderNoteAddr);

    const RepaymentControllerV2Factory = await ethers.getContractFactory("RepaymentControllerV2");
    const repaymentControllerV2 = <RepaymentControllerV2>(
        await RepaymentControllerV2Factory.deploy(loanCoreV2.address, borrowerNoteAddr, lenderNoteAddr)
    );
    await repaymentControllerV2.deployed();
    const updateRepaymentControllerV2Permissions = await loanCoreV2.grantRole(
        REPAYER_ROLE,
        repaymentControllerV2.address,
    );
    await updateRepaymentControllerV2Permissions.wait();

    console.log("RepaymentControllerV2 deployed to:", repaymentControllerV2.address);

    const OriginationControllerFactory = await ethers.getContractFactory("OriginationController");
    const originationController = <OriginationController>(
        await OriginationControllerFactory.deploy(loanCoreV2.address, assetWrapper.address)
    );
    await originationController.deployed();
    const updateOriginationControllerPermissions = await loanCoreV2.grantRole(
        ORIGINATOR_ROLE,
        originationController.address,
    );
    await updateOriginationControllerPermissions.wait();

    console.log("OriginationController deployed to:", originationController.address);

    return {
        assetWrapper,
        feeController,
        loanCoreV2,
        borrowerNote,
        lenderNote,
        repaymentControllerV2,
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
