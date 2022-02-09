import { expect } from "chai";
import hre, { waffle } from "hardhat";
const { loadFixture } = waffle;
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { deploy } from "./utils/contracts";

import { OriginationController, MockERC20, VaultFactory, AssetVault, PromissoryNote, MockLoanCore } from "../typechain";
import { approve, mint, ZERO_ADDRESS } from "./utils/erc20";
import { LoanTerms } from "./utils/types";
import { createLoanTermsSignature, createPermitSignature } from "./utils/eip712";

type Signer = SignerWithAddress;

interface TestContext {
    originationController: OriginationController;
    mockERC20: MockERC20;
    assetWrapper: VaultFactory;
    lenderPromissoryNote: PromissoryNote;
    borrowerPromissoryNote: PromissoryNote;
    loanCore: MockLoanCore;
    user: Signer;
    other: Signer;
    signers: Signer[];
}

const initializeBundle = async (assetWrapper: VaultFactory, user: Signer): Promise<BigNumber> => {
    const tx = await assetWrapper.connect(user).initializeBundle(await user.getAddress());
    const receipt = await tx.wait();

    if (receipt && receipt.events && receipt.events.length === 2 && receipt.events[1].args) {
        return receipt.events[1].args.vault;
    } else {
        throw new Error("Unable to initialize bundle");
    }
};

const fixture = async (): Promise<TestContext> => {
    const signers: Signer[] = await hre.ethers.getSigners();
    const loanCore = <MockLoanCore>await deploy("MockLoanCore", signers[0], []);
    const vaultTemplate = <AssetVault>await deploy("AssetVault", signers[0], []);
    const assetWrapper = <VaultFactory>await deploy("VaultFactory", signers[0], [vaultTemplate.address]);
    const mockERC20 = <MockERC20>await deploy("MockERC20", signers[0], ["Mock ERC20", "MOCK"]);

    const originationController = <OriginationController>(
        await deploy("OriginationController", signers[0], [loanCore.address, assetWrapper.address])
    );

    const borrowerNoteAddress = await loanCore.borrowerNote();
    const lenderNoteAddress = await loanCore.lenderNote();

    const noteFactory = await hre.ethers.getContractFactory("PromissoryNote");
    const borrowerPromissoryNote = <PromissoryNote>await noteFactory.attach(borrowerNoteAddress);
    const lenderPromissoryNote = <PromissoryNote>await noteFactory.attach(lenderNoteAddress);

    return {
        originationController,
        mockERC20,
        assetWrapper,
        lenderPromissoryNote,
        borrowerPromissoryNote,
        loanCore,
        user: signers[0],
        other: signers[1],
        signers: signers.slice(2),
    };
};

const createLoanTerms = (
    payableCurrency: string,
    {
        durationSecs = 360000,
        principal = hre.ethers.utils.parseEther("100"),
        interest = hre.ethers.utils.parseEther("1"),
        collateralTokenId = BigNumber.from("1"),
    }: Partial<LoanTerms> = {},
): LoanTerms => {
    return {
        durationSecs,
        principal,
        interest,
        collateralTokenId,
        payableCurrency,
    };
};

const maxDeadline = hre.ethers.constants.MaxUint256;

describe("OriginationController", () => {
    describe("constructor", () => {
        it("Reverts if _loanCore address is not provided", async () => {
            const signers: Signer[] = await hre.ethers.getSigners();
            const vaultTemplate = <AssetVault>await deploy("AssetVault", signers[0], []);
            const assetWrapper = <VaultFactory>await deploy("VaultFactory", signers[0], [vaultTemplate.address]);
            await expect(
                deploy("OriginationController", signers[0], [ZERO_ADDRESS, assetWrapper.address]),
            ).to.be.revertedWith("Origination: loanCore not defined");
        });

        it("Instantiates the OriginationController", async () => {
            const signers: Signer[] = await hre.ethers.getSigners();
            const loanCore = <MockLoanCore>await deploy("MockLoanCore", signers[0], []);
            const vaultTemplate = <AssetVault>await deploy("AssetVault", signers[0], []);
            const assetWrapper = <VaultFactory>await deploy("VaultFactory", signers[0], [vaultTemplate.address]);
            const originationController = await deploy("OriginationController", signers[0], [
                loanCore.address,
                assetWrapper.address,
            ]);
            expect(await originationController.vaultFactory()).to.equal(assetWrapper.address);
        });
    });

    describe("initializeLoan", () => {
        it("Reverts if msg.sender is not either lender or borrower", async () => {
            const {
                originationController,
                mockERC20,
                assetWrapper,
                user: lender,
                other: borrower,
                signers,
            } = await loadFixture(fixture);

            const bundleId = await initializeBundle(assetWrapper, borrower);
            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            await mint(mockERC20, lender, loanTerms.principal);

            const { v, r, s } = await createLoanTermsSignature(
                originationController.address,
                "OriginationController",
                loanTerms,
                borrower,
            );

            await approve(mockERC20, lender, originationController.address, loanTerms.principal);
            await assetWrapper.connect(borrower).approve(originationController.address, bundleId);
            await expect(
                originationController
                    // some random guy
                    .connect(signers[3])
                    .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s),
            ).to.be.revertedWith("Origination: sender not participant");
        });

        it("Reverts if wNFT not approved", async () => {
            const {
                originationController,
                mockERC20,
                assetWrapper,
                user: lender,
                other: borrower,
            } = await loadFixture(fixture);

            const bundleId = await initializeBundle(assetWrapper, borrower);
            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            await mint(mockERC20, lender, loanTerms.principal);

            const { v, r, s } = await createLoanTermsSignature(
                originationController.address,
                "OriginationController",
                loanTerms,
                borrower,
            );

            await approve(mockERC20, lender, originationController.address, loanTerms.principal);
            // no approval of wNFT token
            await expect(
                originationController
                    .connect(lender)
                    .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s),
            ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
        });

        it("Reverts if principal not approved", async () => {
            const {
                originationController,
                mockERC20,
                assetWrapper,
                user: lender,
                other: borrower,
            } = await loadFixture(fixture);

            const bundleId = await initializeBundle(assetWrapper, borrower);
            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            await mint(mockERC20, lender, loanTerms.principal);

            const { v, r, s } = await createLoanTermsSignature(
                originationController.address,
                "OriginationController",
                loanTerms,
                borrower,
            );

            await assetWrapper.connect(borrower).approve(originationController.address, bundleId);
            // no approval of principal token
            await expect(
                originationController
                    .connect(lender)
                    .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s),
            ).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
        });

        it("Reverts if approving own loan", async () => {
            const {
                originationController,
                mockERC20,
                assetWrapper,
                user: lender,
                other: borrower,
            } = await loadFixture(fixture);

            const bundleId = await initializeBundle(assetWrapper, borrower);
            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            await mint(mockERC20, lender, loanTerms.principal);

            const { v, r, s } = await createLoanTermsSignature(
                originationController.address,
                "OriginationController",
                loanTerms,
                borrower,
            );
            await approve(mockERC20, lender, originationController.address, loanTerms.principal);
            await assetWrapper.connect(borrower).approve(originationController.address, bundleId);
            await expect(
                originationController
                    // sender is the borrower, signer is also the borrower
                    .connect(borrower)
                    .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s),
            ).to.be.revertedWith("Origination: approved own loan");
        });

        it("Reverts if signer is not a participant", async () => {
            const {
                originationController,
                mockERC20,
                assetWrapper,
                user: lender,
                other: borrower,
                signers,
            } = await loadFixture(fixture);

            const bundleId = await initializeBundle(assetWrapper, borrower);
            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            await mint(mockERC20, lender, loanTerms.principal);

            // signer is some random guy
            const { v, r, s } = await createLoanTermsSignature(
                originationController.address,
                "OriginationController",
                loanTerms,
                signers[3],
            );

            await approve(mockERC20, lender, originationController.address, loanTerms.principal);
            await assetWrapper.connect(borrower).approve(originationController.address, bundleId);
            await expect(
                originationController
                    .connect(lender)
                    .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s),
            ).to.be.revertedWith("Origination: signer not participant");
        });

        it("Initializes a loan", async () => {
            const {
                originationController,
                mockERC20,
                assetWrapper,
                user: lender,
                other: borrower,
            } = await loadFixture(fixture);

            const bundleId = await initializeBundle(assetWrapper, borrower);
            const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
            await mint(mockERC20, lender, loanTerms.principal);

            const { v, r, s } = await createLoanTermsSignature(
                originationController.address,
                "OriginationController",
                loanTerms,
                borrower,
            );

            await approve(mockERC20, lender, originationController.address, loanTerms.principal);
            await assetWrapper.connect(borrower).approve(originationController.address, bundleId);
            await expect(
                originationController
                    .connect(lender)
                    .initializeLoan(loanTerms, await borrower.getAddress(), await lender.getAddress(), v, r, s),
            )
                .to.emit(mockERC20, "Transfer")
                .withArgs(await lender.getAddress(), originationController.address, loanTerms.principal);
        });

        describe("initializeLoanWithCollateralPermit", () => {
            it("Reverts if AssetWrapper.permit is invalid", async () => {
                const {
                    originationController,
                    assetWrapper,
                    user,
                    other,
                    mockERC20,
                    lenderPromissoryNote,
                    borrowerPromissoryNote,
                } = await loadFixture(fixture);

                const bundleId = await initializeBundle(assetWrapper, user);
                const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
                await mint(mockERC20, other, loanTerms.principal);

                // invalid signature because tokenId is something random here
                const permitData = {
                    owner: await user.getAddress(),
                    spender: originationController.address,
                    tokenId: 1234,
                    nonce: 0,
                    deadline: maxDeadline,
                };

                const {
                    v: collateralV,
                    r: collateralR,
                    s: collateralS,
                } = await createPermitSignature(assetWrapper.address, await assetWrapper.name(), permitData, user);
                const { v, r, s } = await createLoanTermsSignature(
                    originationController.address,
                    "OriginationController",
                    loanTerms,
                    user,
                );

                await expect(
                    originationController
                        .connect(user)
                        .initializeLoanWithCollateralPermit(
                            loanTerms,
                            lenderPromissoryNote.address,
                            borrowerPromissoryNote.address,
                            collateralV,
                            collateralR,
                            collateralS,
                            v,
                            r,
                            s,
                            maxDeadline,
                        ),
                ).to.be.revertedWith("ERC721Permit: not owner");
            });

            it("Initializes a loan with permit", async () => {
                const {
                    originationController,
                    mockERC20,
                    assetWrapper,
                    user: lender,
                    other: borrower,
                } = await loadFixture(fixture);

                const bundleId = await initializeBundle(assetWrapper, borrower);
                const loanTerms = createLoanTerms(mockERC20.address, { collateralTokenId: bundleId });
                await mint(mockERC20, lender, loanTerms.principal);

                const permitData = {
                    owner: await borrower.getAddress(),
                    spender: originationController.address,
                    tokenId: bundleId,
                    nonce: 0,
                    deadline: maxDeadline,
                };
                const {
                    v: collateralV,
                    r: collateralR,
                    s: collateralS,
                } = await createPermitSignature(assetWrapper.address, await assetWrapper.name(), permitData, borrower);
                const { v, r, s } = await createLoanTermsSignature(
                    originationController.address,
                    "OriginationController",
                    loanTerms,
                    borrower,
                );

                await approve(mockERC20, lender, originationController.address, loanTerms.principal);
                await expect(
                    originationController
                        .connect(lender)
                        .initializeLoanWithCollateralPermit(
                            loanTerms,
                            await borrower.getAddress(),
                            await lender.getAddress(),
                            v,
                            r,
                            s,
                            collateralV,
                            collateralR,
                            collateralS,
                            maxDeadline,
                        ),
                )
                    .to.emit(mockERC20, "Transfer")
                    .withArgs(await lender.getAddress(), originationController.address, loanTerms.principal);
            });
        });
    });
});
