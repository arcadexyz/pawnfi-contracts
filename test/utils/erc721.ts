import { Signer, BigNumber } from "ethers";
import { MockERC721 } from "../../typechain/MockERC721";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Mint a token for `to`
 */
export const mint = async (token: MockERC721, to: Signer): Promise<BigNumber> => {
  const tx = await token.mint(await to.getAddress());
  const receipt = await tx.wait();

  if (receipt && receipt.events && receipt.events.length === 1 && receipt.events[0].args) {
    return receipt.events[0].args.tokenId;
  } else {
    throw new Error("Unable to initialize loan");
  }
};