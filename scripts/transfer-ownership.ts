import { ethers } from "hardhat";

const ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
const FEE_CLAIMER_ROLE = "0x8dd046eb6fe22791cf064df41dbfc76ef240a563550f519aac88255bd8c2d3bb";

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
    console.log(`Admin address: ${ADMIN_ADDRESS}`);
    console.log(`Loan core address: ${LOAN_CORE_ADDRESS}`);
    if (FEE_CONTROLLER_ADDRESS) {
        console.log(`Fee controller address: ${FEE_CONTROLLER_ADDRESS}`);
    }

    const loanCore = await ethers.getContractAt("LoanCore", LOAN_CORE_ADDRESS);
    // set LoanCore admin and fee claimer
    const updateLoanCoreFeeClaimer = await loanCore.grantRole(FEE_CLAIMER_ROLE, ADMIN_ADDRESS);
    await updateLoanCoreFeeClaimer.wait();
    const updateLoanCoreAdmin = await loanCore.grantRole(ADMIN_ROLE, ADMIN_ADDRESS);
    await updateLoanCoreAdmin.wait();

    // renounce ownership from deployer
    const renounceAdmin = await loanCore.renounceRole(ADMIN_ROLE, await deployer.getAddress());
    await renounceAdmin.wait();
    // renounce ability to claim fees
    const renounceFeeClaimer = await loanCore.renounceRole(FEE_CLAIMER_ROLE, await deployer.getAddress());
    await renounceFeeClaimer.wait();

    if (FEE_CONTROLLER_ADDRESS) {
        // set FeeController admin
        const feeController = await ethers.getContractAt("FeeController", FEE_CONTROLLER_ADDRESS);
        const updateFeeControllerAdmin = await feeController.transferOwnership(ADMIN_ADDRESS);
        await updateFeeControllerAdmin.wait();
    }

    console.log('Transferred all ownership.\n');
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
