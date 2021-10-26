import { Contract } from "ethers";
import { ethers } from "hardhat";

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
    assetWrapper: Contract;
    feeController: Contract;
    loanCore: Contract;
    borrowerNote: Contract;
    lenderNote: Contract;
    repaymentController: Contract;
    originationController: Contract;
}

export async function main(
    ORIGINATOR_ROLE = "0x59abfac6520ec36a6556b2a4dd949cc40007459bcd5cd2507f1e5cc77b6bc97e",
    REPAYER_ROLE = "0x9c60024347074fd9de2c1e36003080d22dbc76a41ef87444d21e361bcb39118e",
    ASSET_WRAPPER_ADDRESS = "0x1F563CDd688ad47b75E474FDe74E87C643d129b7",
    FEE_CONTROLLER_ADDRESS = "0xfc2b8D5C60c8E8BbF8d6dc685F03193472e39587"
): Promise<DeployedResources> {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");

    // Attach to existing contracts
    const AssetWrapper = await ethers.getContractFactory("AssetWrapper");
    const assetWrapper = await AssetWrapper.attach(ASSET_WRAPPER_ADDRESS);

    const FeeController = await ethers.getContractFactory("FeeController");
    const feeController = await FeeController.attach(FEE_CONTROLLER_ADDRESS);

    // Start deploying new contracts
    const LoanCore = await ethers.getContractFactory("LoanCore");
    const loanCore = await LoanCore.deploy(ASSET_WRAPPER_ADDRESS, FEE_CONTROLLER_ADDRESS);
    await loanCore.deployed();

    const promissoryNoteFactory = await ethers.getContractFactory("PromissoryNote");
    const borrowerNoteAddr = await loanCore.borrowerNote();
    const borrowerNote = await promissoryNoteFactory.attach(borrowerNoteAddr);
    const lenderNoteAddr = await loanCore.lenderNote();
    const lenderNote = await promissoryNoteFactory.attach(lenderNoteAddr);

    console.log("LoanCore deployed to:", loanCore.address);
    console.log("BorrowerNote deployed to:", borrowerNoteAddr);
    console.log("LenderNote deployed to:", lenderNoteAddr);

    const RepaymentController = await ethers.getContractFactory("RepaymentController");
    const repaymentController = await RepaymentController.deploy(loanCore.address, borrowerNoteAddr, lenderNoteAddr);
    await repaymentController.deployed();
    const updateRepaymentControllerPermissions = await loanCore.grantRole(REPAYER_ROLE, repaymentController.address);
    await updateRepaymentControllerPermissions.wait();

    console.log("RepaymentController deployed to:", repaymentController.address);

    const OriginationController = await ethers.getContractFactory("OriginationController");
    const originationController = await OriginationController.deploy(loanCore.address, ASSET_WRAPPER_ADDRESS);
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
