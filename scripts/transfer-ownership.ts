import { ethers } from "hardhat";

const ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

export async function main(
    LOAN_CORE_ADDRESS = process.env.LOAN_CORE_ADDRESS,
    ADMIN_ADDRESS = process.env.ADMIN_ADDRESS,
    FEE_CONTROLLER_ADDRESS = process.env.FEE_CONTROLLER_ADDRESS
): Promise<void> {
    if (!LOAN_CORE_ADDRESS) {
        throw new Error("Must specify LOAN_CORE_ADDRESS in environment!");
    }

    if (!ADMIN_ADDRESS) {
        throw new Error("Must specify ADMIN_ADDRESS in environment!");
    }

    const [deployer] = await ethers.getSigners();
    console.log(`Deployer address: ${await deployer.getAddress()}`);

    const loanCore = await ethers.getContractAt("LoanCore", LOAN_CORE_ADDRESS);
    // set LoanCore admin
    const updateLoanCoreAdmin = await loanCore.grantRole(ADMIN_ROLE, ADMIN_ADDRESS);
    await updateLoanCoreAdmin.wait();

    // renounce ownership from reployer
    const renounceAdmin = await loanCore.renounceRole(ADMIN_ROLE, await deployer.getAddress());
    await renounceAdmin.wait();

    if (FEE_CONTROLLER_ADDRESS) {
        // set FeeController admin
        const feeController = await ethers.getContractAt("FeeController", FEE_CONTROLLER_ADDRESS);
        const updateFeeControllerAdmin = await feeController.transferOwnership(ADMIN_ADDRESS);
        await updateFeeControllerAdmin.wait();
    }
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
