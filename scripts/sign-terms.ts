/* eslint no-unused-vars: 0 */

import hre, { ethers } from "hardhat";
import { createLoanTermsSignature } from "../test/utils/eip712";

import { OriginationController, RepaymentController, ERC20 } from "../typechain";
import { LoanTerms } from "../test/utils/types";


export async function main(): Promise<void> {
    const signers = (await ethers.getSigners()).slice(0, 6);

    console.log("SIGNERS", signers[0].address, signers[1].address);

    const lender = signers[1];
    const borrower = signers[0];

    const oneDayMs = 1000 * 60 * 60 * 24;
    const oneWeekMs = oneDayMs * 7;

    const relSecondsFromMs = (msToAdd: number) => Math.floor(msToAdd / 1000);

    // // 1 will borrow from 2
    // const loanTerms: LoanTerms = {
    //     durationSecs: relSecondsFromMs(oneWeekMs),
    //     principal: ethers.utils.parseEther("0.1"),
    //     interest: ethers.utils.parseEther("0.05"),
    //     collateralTokenId: ethers.BigNumber.from(28),
    //     payableCurrency: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    // };

    // const OriginationControllerFactory = await ethers.getContractFactory("OriginationController");
    // const originationController = <OriginationController>await OriginationControllerFactory.attach('0x0585a675029C68A6AF41Ba1350BC8172D6172320');

    // const {
    //     v, r, s
    // } = await createLoanTermsSignature(originationController.address, "OriginationController", loanTerms, borrower);

    // // Borrower signed, so lender will initialize
    // await originationController
    //     .connect(lender)
    //     .initializeLoan(loanTerms, borrower.address, lender.address, v, r, s);

    const RepaymentControllerFactory = await ethers.getContractFactory("RepaymentController");
    const repaymentController = <RepaymentController>await RepaymentControllerFactory.attach('0x9eCE636e942bCb67f9E0b7B6C51A56570EF6F38d');

    const ERC20Factory = await ethers.getContractFactory("ERC20");
    const weth = <ERC20>await ERC20Factory.attach('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');

    // await weth.connect(borrower).approve(repaymentController.address, ethers.utils.parseEther("100"));

    // console.log('Did approval');

    await repaymentController
        .connect(borrower)
        .repay(1);
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
