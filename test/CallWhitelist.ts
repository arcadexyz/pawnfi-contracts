import { expect } from "chai";
import hre, { waffle } from "hardhat";
const { loadFixture } = waffle;
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { CallWhitelist, MockERC20, MockERC721, MockERC1155 } from "../typechain";
import { deploy } from "./utils/contracts";

type Signer = SignerWithAddress;

interface TestContext {
    whitelist: CallWhitelist;
    mockERC20: MockERC20;
    mockERC721: MockERC721;
    mockERC1155: MockERC1155;
    user: Signer;
    other: Signer;
    signers: Signer[];
}

describe("CallWhitelist", () => {
    /**
     * Sets up a test context, deploying new contracts and returning them for use in a test
     */
    const fixture = async (): Promise<TestContext> => {
        const signers: Signer[] = await hre.ethers.getSigners();
        const whitelist = <CallWhitelist>await deploy("CallWhitelist", signers[0], []);
        const mockERC20 = <MockERC20>await deploy("MockERC20", signers[0], ["Mock ERC20", "MOCK"]);
        const mockERC721 = <MockERC721>await deploy("MockERC721", signers[0], ["Mock ERC721", "MOCK"]);
        const mockERC1155 = <MockERC1155>await deploy("MockERC1155", signers[0], []);

        return {
            whitelist,
            mockERC20,
            mockERC721,
            mockERC1155,
            user: signers[0],
            other: signers[1],
            signers: signers.slice(2),
        };
    };

    describe("Access control", function () {
        describe("add", async () => {
            it("should succeed from owner", async () => {
                const { whitelist, mockERC20, user } = await loadFixture(fixture);

                const selector = mockERC20.interface.getSighash("mint");
                await expect(whitelist.connect(user).add(mockERC20.address, selector))
                    .to.emit(whitelist, "CallAdded")
                    .withArgs(await user.getAddress(), mockERC20.address, selector);
            });

            it("should fail from non-owner", async () => {
                const { whitelist, mockERC20, other } = await loadFixture(fixture);

                const selector = mockERC20.interface.getSighash("mint");
                await expect(whitelist.connect(other).add(mockERC20.address, selector)).to.be.revertedWith(
                    "Ownable: caller is not the owner",
                );
            });

            it("should succeed after ownership transferred", async () => {
                const { whitelist, mockERC20, user, other } = await loadFixture(fixture);

                const selector = mockERC20.interface.getSighash("mint");
                await expect(whitelist.connect(user).transferOwnership(await other.getAddress()))
                    .to.emit(whitelist, "OwnershipTransferred")
                    .withArgs(await user.getAddress(), await other.getAddress());
                await expect(whitelist.connect(other).add(mockERC20.address, selector))
                    .to.emit(whitelist, "CallAdded")
                    .withArgs(await other.getAddress(), mockERC20.address, selector);
            });

            it("should fail from old address after ownership transferred", async () => {
                const { whitelist, mockERC20, user, other } = await loadFixture(fixture);

                const selector = mockERC20.interface.getSighash("mint");
                await expect(whitelist.connect(user).transferOwnership(await other.getAddress()))
                    .to.emit(whitelist, "OwnershipTransferred")
                    .withArgs(await user.getAddress(), await other.getAddress());
                await expect(whitelist.connect(user).add(mockERC20.address, selector)).to.be.revertedWith(
                    "Ownable: caller is not the owner",
                );
            });
        });

        describe("remove", async () => {
            it("should succeed from owner", async () => {
                const { whitelist, mockERC20, user } = await loadFixture(fixture);

                const selector = mockERC20.interface.getSighash("mint");
                await expect(whitelist.connect(user).add(mockERC20.address, selector))
                    .to.emit(whitelist, "CallAdded")
                    .withArgs(await user.getAddress(), mockERC20.address, selector);
                await expect(whitelist.connect(user).remove(mockERC20.address, selector))
                    .to.emit(whitelist, "CallRemoved")
                    .withArgs(await user.getAddress(), mockERC20.address, selector);
            });

            it("should fail from non-owner", async () => {
                const { whitelist, mockERC20, user, other } = await loadFixture(fixture);

                const selector = mockERC20.interface.getSighash("mint");
                await expect(whitelist.connect(user).add(mockERC20.address, selector))
                    .to.emit(whitelist, "CallAdded")
                    .withArgs(await user.getAddress(), mockERC20.address, selector);
                await expect(whitelist.connect(other).remove(mockERC20.address, selector)).to.be.revertedWith(
                    "Ownable: caller is not the owner",
                );
            });

            it("should succeed after ownership transferred", async () => {
                const { whitelist, mockERC20, user, other } = await loadFixture(fixture);

                const selector = mockERC20.interface.getSighash("mint");
                await expect(whitelist.connect(user).transferOwnership(await other.getAddress()))
                    .to.emit(whitelist, "OwnershipTransferred")
                    .withArgs(await user.getAddress(), await other.getAddress());
                await expect(whitelist.connect(other).add(mockERC20.address, selector))
                    .to.emit(whitelist, "CallAdded")
                    .withArgs(await other.getAddress(), mockERC20.address, selector);
                await expect(whitelist.connect(other).remove(mockERC20.address, selector))
                    .to.emit(whitelist, "CallRemoved")
                    .withArgs(await other.getAddress(), mockERC20.address, selector);
            });

            it("should fail from old address after ownership transferred", async () => {
                const { whitelist, mockERC20, user, other } = await loadFixture(fixture);

                const selector = mockERC20.interface.getSighash("mint");
                await expect(whitelist.connect(user).transferOwnership(await other.getAddress()))
                    .to.emit(whitelist, "OwnershipTransferred")
                    .withArgs(await user.getAddress(), await other.getAddress());
                await expect(whitelist.connect(other).add(mockERC20.address, selector))
                    .to.emit(whitelist, "CallAdded")
                    .withArgs(await other.getAddress(), mockERC20.address, selector);
                await expect(whitelist.connect(user).remove(mockERC20.address, selector)).to.be.revertedWith(
                    "Ownable: caller is not the owner",
                );
            });
        });
    });

    describe("Global blacklist", function () {
        it("erc20 transfer", async () => {
            const { whitelist, mockERC20 } = await loadFixture(fixture);
            const selector = mockERC20.interface.getSighash("transfer");
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
        });

        it("erc20 approve", async () => {
            const { whitelist, mockERC20 } = await loadFixture(fixture);
            const selector = mockERC20.interface.getSighash("approve");
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
        });

        it("erc20 transferFrom", async () => {
            const { whitelist, mockERC20 } = await loadFixture(fixture);
            const selector = mockERC20.interface.getSighash("transferFrom");
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
        });

        it("erc721 transferFrom", async () => {
            const { whitelist, mockERC721 } = await loadFixture(fixture);
            const selector = mockERC721.interface.getSighash("transferFrom");
            expect(await whitelist.isWhitelisted(mockERC721.address, selector)).to.be.false;
        });

        it("erc721 safeTransferFrom", async () => {
            const { whitelist, mockERC721 } = await loadFixture(fixture);
            const selector = mockERC721.interface.getSighash("safeTransferFrom(address,address,uint256)");
            expect(await whitelist.isWhitelisted(mockERC721.address, selector)).to.be.false;
        });

        it("erc721 safeTransferFrom with data", async () => {
            const { whitelist, mockERC721 } = await loadFixture(fixture);
            const selector = mockERC721.interface.getSighash("safeTransferFrom(address,address,uint256,bytes)");
            expect(await whitelist.isWhitelisted(mockERC721.address, selector)).to.be.false;
        });

        it("erc721 setApprovalForAll", async () => {
            const { whitelist, mockERC721 } = await loadFixture(fixture);
            const selector = mockERC721.interface.getSighash("setApprovalForAll");
            expect(await whitelist.isWhitelisted(mockERC721.address, selector)).to.be.false;
        });

        it("erc1155 setApprovalForAll", async () => {
            const { whitelist, mockERC1155 } = await loadFixture(fixture);
            const selector = mockERC1155.interface.getSighash("setApprovalForAll");
            expect(await whitelist.isWhitelisted(mockERC1155.address, selector)).to.be.false;
        });

        it("erc1155 safeTransferFrom", async () => {
            const { whitelist, mockERC1155 } = await loadFixture(fixture);
            const selector = mockERC1155.interface.getSighash("safeTransferFrom");
            expect(await whitelist.isWhitelisted(mockERC1155.address, selector)).to.be.false;
        });

        it("erc1155 safeBatchTransferFrom", async () => {
            const { whitelist, mockERC1155 } = await loadFixture(fixture);
            const selector = mockERC1155.interface.getSighash("safeBatchTransferFrom");
            expect(await whitelist.isWhitelisted(mockERC1155.address, selector)).to.be.false;
        });
    });

    describe("Whitelist", function () {
        it("doesn't override global blacklist", async () => {
            const { whitelist, mockERC20 } = await loadFixture(fixture);
            const selector = mockERC20.interface.getSighash("transfer");

            await whitelist.add(mockERC20.address, selector);
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
        });

        it("passes after adding to whitelist", async () => {
            const { whitelist, mockERC20 } = await loadFixture(fixture);
            const selector = mockERC20.interface.getSighash("mint");

            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
            await whitelist.add(mockERC20.address, selector);
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.true;
        });

        it("fails after removing to whitelist", async () => {
            const { whitelist, mockERC20 } = await loadFixture(fixture);
            const selector = mockERC20.interface.getSighash("mint");

            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
            await whitelist.add(mockERC20.address, selector);
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.true;
            await whitelist.remove(mockERC20.address, selector);
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
        });

        it("adding twice is a noop", async () => {
            const { whitelist, mockERC20 } = await loadFixture(fixture);
            const selector = mockERC20.interface.getSighash("mint");

            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
            await whitelist.add(mockERC20.address, selector);
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.true;
            await whitelist.add(mockERC20.address, selector);
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.true;
        });

        it("removing twice is a noop", async () => {
            const { whitelist, mockERC20 } = await loadFixture(fixture);
            const selector = mockERC20.interface.getSighash("mint");

            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
            await whitelist.add(mockERC20.address, selector);
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.true;
            await whitelist.remove(mockERC20.address, selector);
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
            await whitelist.remove(mockERC20.address, selector);
            expect(await whitelist.isWhitelisted(mockERC20.address, selector)).to.be.false;
        });
    });
});
