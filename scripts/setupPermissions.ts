import { ethers } from "hardhat";
import hre from 'hardhat';

const ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function main(): Promise<void> {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`address: ${await deployer.getAddress()}`);

    //AssetWrapper deployed to:  0x19E9914Ad48ac7DcfD11E62a07db33C409C766a2
// FeeController deployed to:  0x14Be8504a63CDa1290bddccF6ee0b065B14Daea1
// BorrowerNote deployed to:  0x35D5C3C06c7CD8CaAc1dB88c386fdF3Fa072dbAa
// LenderNote deployed to:  0x0534D55Dbaf3570208c374407e2395eF574962b8
// LoanCore deployed to:  0x788115f0987341714e803A2842f39001888e2071
// RepaymentController deployed to:  0x044934BBBD3B5D609de703CAa00997BCA3Ce86e5
// OriginationController deployed to:  0x53d3ed36A00168ac334c314d1B0C241944CbEC02

  const ADMIN_ADDRESS = "0x9d7A37d62d76d84dCA9E77fF2B945f839548686d";
  const FEE_CONTROLLER_ADDRESS = "0x14Be8504a63CDa1290bddccF6ee0b065B14Daea1";
  const LOAN_CORE_ADDRESS = "0x788115f0987341714e803A2842f39001888e2071";

  const feeController = await ethers.getContractAt("FeeController", FEE_CONTROLLER_ADDRESS);
  const loanCore = await ethers.getContractAt("LoanCore", LOAN_CORE_ADDRESS);

  // set LoanCore admin
  const updateLoanCoreAdmin = await loanCore.grantRole(ADMIN_ROLE, ADMIN_ADDRESS);
  await updateLoanCoreAdmin.wait();
  const renounceAdmin = await loanCore.renounceRole(ADMIN_ROLE, await deployer.getAddress());
  await renounceAdmin.wait();

  // set FeeController admin
  const updateFeeControllerAdmin = await feeController.transferOwnership(ADMIN_ADDRESS);
  await updateFeeControllerAdmin.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
