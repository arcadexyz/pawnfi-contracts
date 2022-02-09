import { expect } from "chai";
import hre, { waffle } from "hardhat";
const { loadFixture } = waffle;
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";

import { AssetVault, VaultFactory, MockERC20, MockERC721, MockERC1155 } from "../typechain";
import { mint } from "./utils/erc20";
import { mint as mintERC721 } from "./utils/erc721";
import { mint as mintERC1155 } from "./utils/erc1155";
import { deploy } from "./utils/contracts";

type Signer = SignerWithAddress;

interface TestContext {
    vault: AssetVault;
    nft: VaultFactory;
    bundleId: BigNumber;
    mockERC20: MockERC20;
    mockERC721: MockERC721;
    mockERC1155: MockERC1155;
    user: Signer;
    other: Signer;
    signers: Signer[];
}

describe("AssetVault", () => {
    const createVault = async (factory: VaultFactory, user: Signer): Promise<AssetVault> => {
        const tx = await factory.connect(user).initializeBundle(await user.getAddress());
        const receipt = await tx.wait();

        let vault: AssetVault | undefined;
        if (receipt && receipt.events) {
            for (const event of receipt.events) {
                if (event.args && event.args.vault) {
                    vault = <AssetVault>await hre.ethers.getContractAt("AssetVault", event.args.vault);
                }
            }
        } else {
            throw new Error("Unable to create new vault");
        }
        if (!vault) {
            throw new Error("Unable to create new vault");
        }
        return vault;
    };

    /**
     * Sets up a test context, deploying new contracts and returning them for use in a test
     */
    const fixture = async (): Promise<TestContext> => {
        const signers: Signer[] = await hre.ethers.getSigners();
        const mockERC20 = <MockERC20>await deploy("MockERC20", signers[0], ["Mock ERC20", "MOCK"]);
        const mockERC721 = <MockERC721>await deploy("MockERC721", signers[0], ["Mock ERC721", "MOCK"]);
        const mockERC1155 = <MockERC1155>await deploy("MockERC1155", signers[0], []);

        const vaultTemplate = <AssetVault>await deploy("AssetVault", signers[0], []);
        const factory = <VaultFactory>await deploy("VaultFactory", signers[0], [vaultTemplate.address]);
        const vault = await createVault(factory, signers[0]);

        return {
            nft: factory,
            vault,
            bundleId: BigNumber.from(vault.address),
            mockERC20,
            mockERC721,
            mockERC1155,
            user: signers[0],
            other: signers[1],
            signers: signers.slice(2),
        };
    };

    describe("Initialize Bundle", function () {
        it("should successfully initialize a bundle", async () => {
            const { nft, user } = await loadFixture(fixture);

            const vault = await createVault(nft, user);
            expect(await vault.ownershipToken()).to.equal(nft.address);
            expect(await vault.withdrawEnabled()).to.equal(false);
        });

        it("should initialize multiple bundles with unique ids", async () => {
            const { nft, user } = await loadFixture(fixture);

            const bundleIds = new Set();
            const size = 25;

            for (let i = 0; i < size; i++) {
                const vault = await createVault(nft, user);
                bundleIds.add(vault.address);
            }

            expect(bundleIds.size).to.equal(size);
        });
    });

    describe("Deposit", () => {
        describe("ERC20", () => {
            it("should accept deposit from an ERC20 token", async () => {
                const { vault, mockERC20, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseUnits("50", 18);

                await mint(mockERC20, user, amount);
                // just directly send ERC20 tokens in
                await mockERC20.connect(user).transfer(vault.address, amount);

                expect(await mockERC20.balanceOf(vault.address)).to.equal(amount);
            });

            it("should accept multiple deposits from an ERC20 token", async () => {
                const { vault, mockERC20, user } = await loadFixture(fixture);
                const baseAmount = hre.ethers.utils.parseUnits("10", 18);
                let amount = hre.ethers.utils.parseUnits("0", 18);

                for (let i = 0; i < 10; i++) {
                    amount = amount.add(baseAmount);

                    await mint(mockERC20, user, baseAmount);
                    await mockERC20.connect(user).transfer(vault.address, baseAmount);

                    expect(await mockERC20.balanceOf(vault.address)).to.equal(amount);
                }
            });

            it("should accept deposits from multiple ERC20 tokens", async () => {
                const { vault, user } = await loadFixture(fixture);
                const baseAmount = hre.ethers.utils.parseUnits("10", 18);

                for (let i = 0; i < 10; i++) {
                    const mockERC20 = <MockERC20>await deploy("MockERC20", user, ["Mock ERC20", "MOCK" + i]);
                    const amount = baseAmount.mul(i);

                    await mint(mockERC20, user, amount);
                    await mockERC20.connect(user).transfer(vault.address, amount);

                    expect(await mockERC20.balanceOf(vault.address)).to.equal(amount);
                }
            });
        });

        describe("ERC721", () => {
            it("should accept deposit from an ERC721 token", async () => {
                const { vault, mockERC721, user } = await loadFixture(fixture);

                const tokenId = await mintERC721(mockERC721, user);
                await mockERC721.transferFrom(await user.getAddress(), vault.address, tokenId);

                expect(await mockERC721.ownerOf(tokenId)).to.equal(vault.address);
            });

            it("should accept multiple deposits from an ERC721 token", async () => {
                const { vault, mockERC721, user } = await loadFixture(fixture);

                for (let i = 0; i < 10; i++) {
                    const tokenId = await mintERC721(mockERC721, user);
                    await mockERC721.transferFrom(await user.getAddress(), vault.address, tokenId);

                    expect(await mockERC721.ownerOf(tokenId)).to.equal(vault.address);
                }
            });

            it("should accept deposits from multiple ERC721 tokens", async () => {
                const { vault, user } = await loadFixture(fixture);

                for (let i = 0; i < 10; i++) {
                    const mockERC721 = <MockERC721>await deploy("MockERC721", user, ["Mock ERC721", "MOCK" + i]);
                    const tokenId = await mintERC721(mockERC721, user);
                    await mockERC721.transferFrom(await user.getAddress(), vault.address, tokenId);

                    expect(await mockERC721.ownerOf(tokenId)).to.equal(vault.address);
                }
            });
        });

        describe("ERC1155", () => {
            it("should accept deposit from an ERC1155 NFT", async () => {
                const { vault, mockERC1155, user } = await loadFixture(fixture);
                const amount = BigNumber.from("1");

                const tokenId = await mintERC1155(mockERC1155, user, amount);
                await mockERC1155.safeTransferFrom(await user.getAddress(), vault.address, tokenId, amount, "0x");

                expect(await mockERC1155.balanceOf(vault.address, tokenId)).to.equal(amount);
            });

            it("should accept deposit from an ERC1155 fungible token", async () => {
                const { vault, mockERC1155, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseEther("10");

                const tokenId = await mintERC1155(mockERC1155, user, amount);
                await mockERC1155.safeTransferFrom(await user.getAddress(), vault.address, tokenId, amount, "0x");

                expect(await mockERC1155.balanceOf(vault.address, tokenId)).to.equal(amount);
            });

            it("should accept multiple deposits from an ERC1155 token", async () => {
                const { vault, mockERC1155, user } = await loadFixture(fixture);
                const amount = BigNumber.from("1");

                for (let i = 0; i < 10; i++) {
                    const tokenId = await mintERC1155(mockERC1155, user, amount);
                    await mockERC1155.safeTransferFrom(await user.getAddress(), vault.address, tokenId, amount, "0x");

                    expect(await mockERC1155.balanceOf(vault.address, tokenId)).to.equal(amount);
                }
            });

            it("should accept deposits from multiple ERC1155 tokens", async () => {
                const { vault, user } = await loadFixture(fixture);
                const amount = BigNumber.from("1");

                for (let i = 0; i < 10; i++) {
                    const mockERC1155 = <MockERC1155>await deploy("MockERC1155", user, []);

                    const tokenId = await mintERC1155(mockERC1155, user, amount);
                    await mockERC1155.safeTransferFrom(await user.getAddress(), vault.address, tokenId, amount, "0x");

                    expect(await mockERC1155.balanceOf(vault.address, tokenId)).to.equal(amount);
                }
            });
        });

        describe("ETH", () => {
            it("should accept deposit of ETH", async () => {
                const { vault, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseEther("50");

                await user.sendTransaction({
                    to: vault.address,
                    value: amount,
                });

                expect(await vault.provider.getBalance(vault.address)).to.equal(amount);
            });

            it("should accept multiple deposits of ETH", async () => {
                const { vault, user } = await loadFixture(fixture);

                let total = BigNumber.from(0);
                for (let i = 1; i <= 10; i++) {
                    const amount = hre.ethers.utils.parseEther(i.toString());
                    await user.sendTransaction({
                        to: vault.address,
                        value: amount,
                    });
                    total = total.add(amount);
                }

                const holdings = await vault.provider.getBalance(vault.address);
                expect(holdings).to.equal(total);
            });
        });
    });

    describe("enableWithdraw", () => {
        it("should close the vault", async () => {
            const { vault, user } = await loadFixture(fixture);
            expect(await vault.withdrawEnabled()).to.equal(false);
            await expect(vault.enableWithdraw())
                .to.emit(vault, "WithdrawEnabled")
                .withArgs(await user.getAddress());

            expect(await vault.withdrawEnabled()).to.equal(true);
        });

        it("should fail to close the vault by non-owner", async () => {
            const { vault, other } = await loadFixture(fixture);
            expect(await vault.withdrawEnabled()).to.equal(false);
            await expect(vault.connect(other).enableWithdraw()).to.be.revertedWith(
                "OwnableERC721: caller is not the owner",
            );

            expect(await vault.withdrawEnabled()).to.equal(false);
        });
    });

    describe("Withdraw", () => {
        describe("ERC20", () => {
            /**
             * Set up a withdrawal test by depositing some ERC20s into a bundle
             */
            const deposit = async (token: MockERC20, vault: AssetVault, amount: BigNumber, user: Signer) => {
                await mint(token, user, amount);
                await token.connect(user).transfer(vault.address, amount);
            };

            it("should withdraw single deposit from a bundle", async () => {
                const { vault, mockERC20, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseUnits("50", 18);
                await deposit(mockERC20, vault, amount, user);

                await vault.enableWithdraw();
                await expect(vault.connect(user).withdrawERC20(mockERC20.address, await user.getAddress()))
                    .to.emit(vault, "WithdrawERC20")
                    .withArgs(await user.getAddress(), mockERC20.address, await user.getAddress(), amount)
                    .to.emit(mockERC20, "Transfer")
                    .withArgs(vault.address, await user.getAddress(), amount);
            });

            it("should withdraw single deposit from a bundle after transfer", async () => {
                const { nft, bundleId, vault, mockERC20, user, other } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseUnits("50", 18);
                await deposit(mockERC20, vault, amount, user);
                await nft["safeTransferFrom(address,address,uint256)"](
                    await user.getAddress(),
                    await other.getAddress(),
                    bundleId,
                );

                await expect(vault.connect(other).enableWithdraw())
                    .to.emit(vault, "WithdrawEnabled")
                    .withArgs(await other.getAddress());
                await expect(vault.connect(other).withdrawERC20(mockERC20.address, await other.getAddress()))
                    .to.emit(vault, "WithdrawERC20")
                    .withArgs(await other.getAddress(), mockERC20.address, await other.getAddress(), amount)
                    .to.emit(mockERC20, "Transfer")
                    .withArgs(bundleId, await other.getAddress(), amount);
            });

            it("should withdraw multiple deposits of the same token from a bundle", async () => {
                const { vault, mockERC20, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseUnits("50", 18);
                await deposit(mockERC20, vault, amount, user);
                const secondAmount = hre.ethers.utils.parseUnits("14", 18);
                await deposit(mockERC20, vault, secondAmount, user);
                const total = amount.add(secondAmount);

                await vault.enableWithdraw();
                await expect(vault.connect(user).withdrawERC20(mockERC20.address, await user.getAddress()))
                    .to.emit(vault, "WithdrawERC20")
                    .withArgs(await user.getAddress(), mockERC20.address, await user.getAddress(), total)
                    .to.emit(mockERC20, "Transfer")
                    .withArgs(vault.address, await user.getAddress(), total);
            });

            it("should withdraw deposits of multiple tokens from a bundle", async () => {
                const { vault, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseUnits("50", 18);

                const tokens = [];
                for (let i = 0; i < 10; i++) {
                    const mockERC20 = <MockERC20>await deploy("MockERC20", user, ["Mock ERC20", "MOCK" + i]);
                    await deposit(mockERC20, vault, amount, user);
                    tokens.push(mockERC20);
                }

                await vault.enableWithdraw();
                for (const token of tokens) {
                    await expect(vault.connect(user).withdrawERC20(token.address, await user.getAddress()))
                        .to.emit(vault, "WithdrawERC20")
                        .withArgs(await user.getAddress(), token.address, await user.getAddress(), amount)
                        .to.emit(token, "Transfer")
                        .withArgs(vault.address, await user.getAddress(), amount);
                }
            });

            it("should fail to withdraw when withdraws disabled", async () => {
                const { vault, mockERC20, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseUnits("50", 18);
                await deposit(mockERC20, vault, amount, user);

                await expect(
                    vault.connect(user).withdrawERC20(mockERC20.address, await user.getAddress()),
                ).to.be.revertedWith("AssetVault: withdraws disabled");
            });

            it("should fail to withdraw from non-owner", async () => {
                const { vault, mockERC20, user, other } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseUnits("50", 18);
                await deposit(mockERC20, vault, amount, user);

                await vault.enableWithdraw();
                await expect(
                    vault.connect(other).withdrawERC20(mockERC20.address, await user.getAddress()),
                ).to.be.revertedWith("OwnableERC721: caller is not the owner");
            });

            it("should throw when withdraw called by non-owner", async () => {
                const { vault, mockERC20, user, other } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseUnits("50", 18);
                await deposit(mockERC20, vault, amount, user);

                await expect(
                    vault.connect(other).withdrawERC20(mockERC20.address, await user.getAddress()),
                ).to.be.revertedWith("OwnableERC721: caller is not the owner");
            });

            it("should fail when non-owner calls with approval", async () => {
                const { nft, vault, mockERC20, user, other } = await loadFixture(fixture);

                await nft.connect(user).approve(await other.getAddress(), vault.address);
                await expect(
                    vault.connect(other).withdrawERC20(mockERC20.address, await user.getAddress()),
                ).to.be.revertedWith("OwnableERC721: caller is not the owner");
            });
        });

        describe("ERC721", () => {
            /**
             * Set up a withdrawal test by depositing some ERC721s into a bundle
             */
            const deposit = async (token: MockERC721, vault: AssetVault, user: Signer) => {
                const tokenId = await mintERC721(token, user);
                await token["safeTransferFrom(address,address,uint256)"](
                    await user.getAddress(),
                    vault.address,
                    tokenId,
                );
                return tokenId;
            };

            it("should withdraw single deposit from a bundle", async () => {
                const { vault, mockERC721, user } = await loadFixture(fixture);
                const tokenId = await deposit(mockERC721, vault, user);

                await vault.enableWithdraw();
                await expect(vault.connect(user).withdrawERC721(mockERC721.address, tokenId, await user.getAddress()))
                    .to.emit(vault, "WithdrawERC721")
                    .withArgs(await user.getAddress(), mockERC721.address, await user.getAddress(), tokenId)
                    .to.emit(mockERC721, "Transfer")
                    .withArgs(vault.address, await user.getAddress(), tokenId);
            });

            it("should throw when already withdrawn", async () => {
                const { vault, mockERC721, user } = await loadFixture(fixture);
                const tokenId = await deposit(mockERC721, vault, user);

                await vault.enableWithdraw();
                await expect(vault.connect(user).withdrawERC721(mockERC721.address, tokenId, await user.getAddress()))
                    .to.emit(vault, "WithdrawERC721")
                    .withArgs(await user.getAddress(), mockERC721.address, await user.getAddress(), tokenId)
                    .to.emit(mockERC721, "Transfer")
                    .withArgs(vault.address, await user.getAddress(), tokenId);

                await expect(
                    vault.connect(user).withdrawERC721(mockERC721.address, tokenId, await user.getAddress()),
                ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
            });

            it("should throw when withdraw called by non-owner", async () => {
                const { vault, mockERC721, user, other } = await loadFixture(fixture);
                const tokenId = await deposit(mockERC721, vault, user);

                await vault.enableWithdraw();
                await expect(
                    vault.connect(other).withdrawERC721(mockERC721.address, tokenId, await user.getAddress()),
                ).to.be.revertedWith("OwnableERC721: caller is not the owner");
            });

            it("should fail to withdraw when withdraws disabled", async () => {
                const { vault, mockERC721, user } = await loadFixture(fixture);
                const tokenId = await deposit(mockERC721, vault, user);

                await expect(
                    vault.connect(user).withdrawERC721(mockERC721.address, tokenId, await user.getAddress()),
                ).to.be.revertedWith("AssetVault: withdraws disabled");
            });
        });

        describe("ERC1155", () => {
            /**
             * Set up a withdrawal test by depositing some ERC1155s into a bundle
             */
            const deposit = async (token: MockERC1155, vault: AssetVault, user: Signer, amount: BigNumber) => {
                const tokenId = await mintERC1155(token, user, amount);
                await token.safeTransferFrom(await user.getAddress(), vault.address, tokenId, amount, "0x");
                return tokenId;
            };

            it("should withdraw single deposit from a bundle", async () => {
                const { vault, mockERC1155, user } = await loadFixture(fixture);
                const amount = BigNumber.from("1");
                const tokenId = await deposit(mockERC1155, vault, user, amount);

                await vault.enableWithdraw();
                await expect(vault.connect(user).withdrawERC1155(mockERC1155.address, tokenId, await user.getAddress()))
                    .to.emit(vault, "WithdrawERC1155")
                    .withArgs(await user.getAddress(), mockERC1155.address, await user.getAddress(), tokenId, amount)
                    .to.emit(mockERC1155, "TransferSingle")
                    .withArgs(vault.address, vault.address, await user.getAddress(), tokenId, amount);
            });

            it("should withdraw fungible deposit from a bundle", async () => {
                const { vault, mockERC1155, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseEther("100");
                const tokenId = await deposit(mockERC1155, vault, user, amount);

                await vault.enableWithdraw();
                await expect(vault.connect(user).withdrawERC1155(mockERC1155.address, tokenId, await user.getAddress()))
                    .to.emit(vault, "WithdrawERC1155")
                    .withArgs(await user.getAddress(), mockERC1155.address, await user.getAddress(), tokenId, amount)
                    .to.emit(mockERC1155, "TransferSingle")
                    .withArgs(vault.address, vault.address, await user.getAddress(), tokenId, amount);
            });

            it("should fail to withdraw when withdrwas disabled", async () => {
                const { vault, mockERC1155, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseEther("100");
                const tokenId = await deposit(mockERC1155, vault, user, amount);

                await expect(
                    vault.connect(user).withdrawERC1155(mockERC1155.address, tokenId, await user.getAddress()),
                ).to.be.revertedWith("AssetVault: withdraws disabled");
            });

            it("should throw when withdraw called by non-owner", async () => {
                const { vault, mockERC1155, user, other } = await loadFixture(fixture);
                const amount = BigNumber.from("1");
                const tokenId = await deposit(mockERC1155, vault, user, amount);

                await vault.enableWithdraw();
                await expect(
                    vault.connect(other).withdrawERC1155(mockERC1155.address, tokenId, await other.getAddress()),
                ).to.be.revertedWith("OwnableERC721: caller is not the owner");
            });
        });

        describe("ETH", () => {
            const deposit = async (vault: AssetVault, user: Signer, amount: BigNumber) => {
                await user.sendTransaction({
                    to: vault.address,
                    value: amount,
                });
            };

            it("should withdraw single deposit from a bundle", async () => {
                const { vault, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseEther("123");
                await deposit(vault, user, amount);
                const startingBalance = await vault.provider.getBalance(await user.getAddress());

                await vault.enableWithdraw();
                await expect(vault.connect(user).withdrawETH(await user.getAddress()))
                    .to.emit(vault, "WithdrawETH")
                    .withArgs(await user.getAddress(), await user.getAddress(), amount);

                const threshold = hre.ethers.utils.parseEther("0.01"); // for txn fee
                const endingBalance = await vault.provider.getBalance(await user.getAddress());
                expect(endingBalance.sub(startingBalance).gt(amount.sub(threshold))).to.be.true;
            });

            it("should fail to withdraw when withdraws disabled", async () => {
                const { vault, user } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseEther("123");
                await deposit(vault, user, amount);

                await expect(vault.connect(user).withdrawETH(await user.getAddress())).to.be.revertedWith(
                    "AssetVault: withdraws disabled",
                );
            });

            it("should throw when withdraw called by non-owner", async () => {
                const { vault, user, other } = await loadFixture(fixture);
                const amount = hre.ethers.utils.parseEther("9");
                await deposit(vault, user, amount);

                await expect(vault.connect(other).withdrawETH(await other.getAddress())).to.be.revertedWith(
                    "OwnableERC721: caller is not the owner",
                );
            });
        });
    });
});
