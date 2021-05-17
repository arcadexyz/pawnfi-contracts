import { expect } from "chai";
import { Signer, BigNumber } from "ethers";
import { MockERC1155 } from "../../typechain";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Mint tokens for `to`
 */
export const mint = async (token: MockERC1155, to: Signer, amount: BigNumber): Promise<string> => {
  const address = await to.getAddress();

  const tx = await token.mint(address, amount);
  const receipt = await tx.wait();

  if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
    return receipt.events[0].args.id;
  } else {
    throw new Error("Unable to initialize bundle");
  }
};

/**
 * approve `amount` tokens for `to` from `from`
 */
export const approve = async (token: MockERC1155, sender: Signer, toAddress: string): Promise<void> => {
  const senderAddress = await sender.getAddress();

  await expect(token.connect(sender).setApprovalForAll(toAddress, true))
    .to.emit(token, "ApprovalForAll")
    .withArgs(senderAddress, toAddress, true);
};
