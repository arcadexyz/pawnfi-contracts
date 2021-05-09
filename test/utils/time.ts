import hre from "hardhat";

export class BlockchainTime {
  async secondsFromNow(secondsFromNow: number): Promise<number> {
    const res = await hre.network.provider.send("eth_getBlockByNumber", ["latest", false]);
    const timestamp = parseInt(res.timestamp, 16);
    return timestamp + secondsFromNow;
  }

  async increaseTime(seconds: number): Promise<void> {
    await hre.network.provider.send("evm_increaseTime", [seconds]);
    await hre.network.provider.send("evm_mine");
  }
}
