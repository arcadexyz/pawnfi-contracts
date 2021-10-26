<img width="3589" alt="pawnf-logo-blue-on-light" src="https://user-images.githubusercontent.com/1355694/138525930-bda64163-2a3e-4358-8cd6-b86556d88611.png">

The [Pawn](https://pawn.fi) protocol facilitates trustless borrowing, lending, and escrow of NFT assets on EVM blockchains. This repository contains the core contracts that power the protocol, written in Solidity.

# Relevant Links

- 🌐 [Website](https://www.pawn.fi/) - Our main website, with a high-level overview of the project.
- 📝 [Usage Documentation](https://docs.pawn.fi) - Our user-facing documentation for the Pawn.fi website and application.
- 💬 [Discord](https://discord.gg/uNrDStEb) - Join the Pawn.fi community! Great for further technical discussion and real-time support.
- 🔔 [Twitter](https://twitter.com/pawn_fi) - Follow us on Twitter for alerts and announcements.

If you are interested in being whitelisted for the Pawn private beta, contact us on Discord. Public launch coming soon!

# Local Setup

This repo uses a fork of [Paul Berg's excellent Solidity template](https://github.com/paulrberg/solidity-template). General usage instructions for the repo can be found there. We use a very normal TypeScript/Yarn/Hardhat toolchain.

## Deploying

In order to deploy the contracts to a local hardhat instance run the deploy script.

`yarn hardhat run scripts/deploy.ts`

The same can be done for non-local instances like Ropsten or Mainnet, but a private key for the address to deploy from must be supplied in `hardhat.config.ts` as specified in [the Hardhat documentation](https://hardhat.org/config/).

## Local Development

In one window, start a node. Wait for it to load. This is a local Ethereum node forked from the current mainnet Ethereum state.

`npx hardhat node`

In another window run the bootrap script with or without loans created.

`yarn bootstrap-with-loans`
or
`yarn bootstrap-no-loans`

Both will deploy our smart contracts, create a collection of ERC20 and ERC721/ERC1155 NFTs, and distribute them amongst the first 5 signers, skipping the first one since it deploys the smart contract. The second target will also wrap assets, and create loans.

# Overview of Contracts

## Version 1

The Version 1 of the Pawn protocol uses the contracts described below for its operation. These contracts are currently deployed on the Ethereum mainnet and the Rinkeby testnet. [The addresses of our deployed can be found in our documentation](https://docs.pawn.fi/docs/contract-addresses). All contracts are verified on [Etherscan](https://etherscan.io/). [Audit reports](https://docs.pawn.fi/docs/audit-reports) are also available.

### AssetWrapper

This contract holds ERC20, ERC721, and ERC1155 assets on behalf of another address. The Pawn protocol interacts with asset wrapped bundles, but bundles have no coupling to the Pawn protocol and can be used for other uses. Any collateral used in the Pawn protocol takes the form of an `AssetWrapper` bundle.

[AssetWrapper API Specification](docs/AssetWrapper.md)

### BorrowerNote

The BorrowerNote is an ERC721 asset that represents the borrower's obligation for a specific loan in the Pawn protocol. The asset can be transferred like a normal ERC721 NFT, which transfers the borrowing obligation to the recipient of the transfer. Holding the `BorrowerNote` attached to a specific loan gives the holder the right to reclaim the collateral bundle when the loan is repaid.

`BorrowerNote` and `LenderNote` are both instantiations of `PromissoryNote`, a generalized NFT contract that implements [ERC721Burnable](https://docs.openzeppelin.com/contracts/3.x/api/token/erc721#ERC721Burnable).

[PromissoryNote API Specification](docs/PromissoryNote.md)
### LenderNote

The LenderNote is an ERC721 asset that represents the lender's rights for a specific loan in the Pawn protocol. The asset can be transferred like a normal ERC721 NFT, which transfers the rights of the lender to the recipient of the transfer. Holding the `LenderNote` attached to a specific loan gives the holder the right to any funds from loan repayments, and the right to claim a collateral bundle for a defaulted loan.

`BorrowerNote` and `LenderNote` are both instantiations of `PromissoryNote`, a generalized NFT contract that implements [ERC721Burnable](https://docs.openzeppelin.com/contracts/3.x/api/token/erc721#ERC721Burnable).

[PromissoryNote API Specification](docs/PromissoryNote.md)

### LoanCore

The core invariants of the Pawn protocol are maintained here. `LoanCore` tracks all active loans, the associated `AssetWrapper` collateral, and `PromissoryNote` obligations. Any execution logic arond loan origination, repayment, or default is contained within `LoanCore`. When a loan is in progress, collateral is held by `LoanCore`, and `LoanCore` contains relevant information about loan terms and due dates.

This contract also contains admin functionality where operators of the protocol can withdraw any accrued revenue from assessed protocol fees.

[LoanCore API Specification](docs/LoanCore.md)

### OriginationController

This is an external-facing periphery contract that manages loan origination interactions with `LoanCore`. The `OriginationController` takes responsibility for transferring collateral assets from the borrower to `LoanCore`. This controller also checks the validity of origination signatures against the specified parties and loan terms.

[OriginationController API Specification](docs/OriginationController.md)

### RepaymentController

This is an external-facing periphery contract that manages interactions with `LoanCore` that end the loan lifecycle. The `RepaymentController` takes responsibility for transferring repaid principal + interest from the borrower to `LoanCore` for disbursal to the lender, and returning collateral assets from `LoanCore` back to the borrower on a successful repayment. This controller also handles lender claims in case of default, and ensures ownership of the lender note before allowing a claim.

[RepaymentController API Specification](docs/RepaymentController.md)

## PunkRouter

[CryptoPunks](https://www.larvalabs.com/cryptopunks) serve as valuable collateral within the NFT ecosystem, but they do not conform to the ERC721 standard. The `PunkRouter` uilizes the [Wrapped Punks](https://wrappedpunks.com/) contract to enable users to deposit CryptoPunks into `AssetWrapper` collateral bundles. This allows wrapping and depositing to a bundle to be an atomic operation.

[PunkRouter API Specification](docs/PunkRouter.md)

## Version 2

Version 2 of the Pawn protocol is currently in development. More details will be added to this section as the protocol progresses towards release.
