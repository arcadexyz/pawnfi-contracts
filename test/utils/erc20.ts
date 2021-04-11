import { expect } from "chai";
import { Signer, BigNumber } from "ethers";
import { MockERC20 } from "../../typechain/MockERC20";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Mint `amount` tokens for `to`
 */
export const mint = async (token: MockERC20, to: Signer, amount: BigNumber): Promise<void> => {
  const address = await to.getAddress();
  const preBalance = await token.balanceOf(address);

  await expect(token.mint(address, amount)).to.emit(token, "Transfer").withArgs(ZERO_ADDRESS, address, amount);

  const postBalance = await token.balanceOf(address);
  expect(postBalance.sub(preBalance)).to.equal(amount);
};

/**
 * approve `amount` tokens for `to` from `from`
 */
export const approve = async (
  token: MockERC20,
  sender: Signer,
  toAddress: string,
  amount: BigNumber,
): Promise<void> => {
  const senderAddress = await sender.getAddress();
  const preApproval = await token.allowance(senderAddress, toAddress);

  await expect(token.connect(sender).approve(toAddress, amount))
    .to.emit(token, "Approval")
    .withArgs(senderAddress, toAddress, amount);

  const postApproval = await token.allowance(senderAddress, toAddress);
  expect(postApproval.sub(preApproval)).to.equal(amount);
};
