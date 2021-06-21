import assert from 'assert';
import hre, { ethers } from "hardhat";
import { Signer, Wallet } from 'ethers';
import { AssetWrapper, MockERC721 } from "../typechain";
import { mint as mintERC721 } from '../test/utils/erc721';
import { LoanTerms, LoanData } from "../test/utils/types";
import { createLoanTermsSignature } from "../test/utils/eip712";

const createCnft = async (assetWrapper: AssetWrapper, user: Signer) => {
    const tx = await assetWrapper.initializeBundle(await user.getAddress());
    const receipt = await tx.wait();
    if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
        return receipt.events[0].args.tokenId;
    } else {
        throw new Error("Unable to initialize bundle");
    }
};

async function main(): Promise<void> {
  const signers = await hre.ethers.getSigners();
  const [borrower, lender] = signers;
  const lenderWallet = Wallet.fromMnemonic(process.env.MNEMONIC!, "m/44'/60'/0'/0/1");
  console.log(`borrower: ${await borrower.getAddress()}, lender: ${await lender.getAddress()}`);
    assert(await lenderWallet.getAddress() === await lender.getAddress());

  const assetWrapper = <AssetWrapper>await ethers.getContractAt("AssetWrapper", "0x19E9914Ad48ac7DcfD11E62a07db33C409C766a2");
  const loanCore = await ethers.getContractAt("LoanCore", "0x788115f0987341714e803A2842f39001888e2071");
  const repaymentController = await ethers.getContractAt("RepaymentController", "0x044934BBBD3B5D609de703CAa00997BCA3Ce86e5");
  const originationController = await ethers.getContractAt("OriginationController", "0x53d3ed36A00168ac334c314d1B0C241944CbEC02");
  const mockERC20 = await ethers.getContractAt("MockERC20", "0x8960c1d97173d5588635535a46002D30e0193B03");
  const mockERC721 = <MockERC721>await ethers.getContractAt("MockERC721", "0x831b715DB5a2B181e1DA6b6Ca7b12f80E575FC55");

  const principal = hre.ethers.utils.parseEther('100');
  const interest = hre.ethers.utils.parseEther('1');

  // lender setup, getting and approving the ERC20 principal
  await mockERC20.mint(await lender.getAddress(), principal);
  await mockERC20.connect(lender).approve(originationController.address, hre.ethers.constants.MaxUint256);

  // borrower setup, depositing some ERC20 and ERC721 to assetwrapper
  const bundleId = await createCnft(assetWrapper, borrower);
  await mockERC20.mint(await borrower.getAddress(), hre.ethers.utils.parseEther('15'));
  let tx = await mockERC20.connect(borrower).approve(assetWrapper.address, hre.ethers.constants.MaxUint256);
  await tx.wait();
  await assetWrapper.connect(borrower).depositERC20(mockERC20.address, hre.ethers.utils.parseEther('15'), bundleId);
  const tokenId = await mintERC721(mockERC721, borrower);
  tx = await mockERC721.connect(borrower).approve(assetWrapper.address, tokenId);
  await tx.wait();
  await assetWrapper.connect(borrower).depositERC721(mockERC721.address, tokenId, bundleId);
  tx = await assetWrapper.connect(borrower).approve(originationController.address, bundleId);
  await tx.wait();

  console.log(`set up bundle with id ${bundleId.toString()}`);

  const terms: LoanTerms = {
      dueDate: new Date(new Date().getTime() + 3600000).getTime(),
      principal,
      interest,
      collateralTokenId: bundleId,
      payableCurrency: mockERC20.address,
  }

  const { v, r, s } = await createLoanTermsSignature(originationController.address, "OriginationController", terms, lenderWallet);

  tx = await originationController.connect(borrower).initializeLoan(terms, await borrower.getAddress(), await lender.getAddress(), v, r, s);
  const receipt = await tx.wait();

  let loanId;
  if (receipt && receipt.events && receipt.events.length === 9) {
    const LoanCreatedLog = new hre.ethers.utils.Interface([
        "event LoanStarted(uint256 loanId, address lender, address borrower)",
    ]);
    const log = LoanCreatedLog.parseLog(receipt.events[8]);
    loanId = log.args.loanId;
  } else {
    throw new Error("Unable to initialize loan");
  }

  const loanData = await loanCore.getLoan(loanId);

  console.log(`started loan with id ${loanId.toString()}: ${loanData}`);
  tx = await mockERC20.mint(await borrower.getAddress(), hre.ethers.utils.parseEther('5'));
  await tx.wait();
  await mockERC20.connect(borrower).approve(repaymentController.address, principal.add(interest));
  await repaymentController.connect(borrower).repay(loanData.borrowerNoteId);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
        console.error(error);
        process.exit(1);
    });
