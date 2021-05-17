import { expect } from "chai";
import { Signer } from "ethers";
import { MockERC721 } from "../../typechain/MockERC721";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Mint tokens for `to`
 */
export const mint = async (token: MockERC721, to: Signer): Promise<string> => {
  const address = await to.getAddress();

  const tx = await token.mint(address);
  const receipt = await tx.wait();

  if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
    return receipt.events[0].args.tokenId;
  } else {
    throw new Error("Unable to initialize bundle");
  }
};

/**
 * approve `amount` tokens for `to` from `from`
 */
export const approve = async (token: MockERC721, sender: Signer, toAddress: string, tokenId: string): Promise<void> => {
  const senderAddress = await sender.getAddress();
  expect(await token.getApproved(tokenId)).to.not.equal(toAddress);

  await expect(token.connect(sender).approve(toAddress, tokenId))
    .to.emit(token, "Approval")
    .withArgs(senderAddress, toAddress, tokenId);

  expect(await token.getApproved(tokenId)).to.equal(toAddress);
};
