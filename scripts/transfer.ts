import { ethers } from "hardhat";

const punksAddress = '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853';

(async function () {
  const signers = await ethers.getSigners();
  const signer1 = signers[1];
  const signer2 = signers[2];
  const one = await signer1.getAddress();
  const two = await signer2.getAddress();

  const PunksFactory = await ethers.getContractFactory('MockERC721');
  let contract = await PunksFactory.attach(punksAddress);
  contract = await contract.connect(signer2);

  await contract.transferFrom(two, one, '0x17');
})();
