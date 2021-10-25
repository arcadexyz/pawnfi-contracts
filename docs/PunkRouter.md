# `PunkRouter`

The PunkRouter is a shim for the `AssetWrapper` that allows it work with CryptoPunks,
which do not fit the ERC721 standard. The PunkRouter's deposit methods use the
[Wrapped Punks](https://wrappedpunks.com/) contract to convert a punk to ERC721
before deposit.

### API

### `constructor(IAssetWrapper _assetWrapper, IWrappedPunks _wrappedPunks, IPunks _punks)`

Deploys the contract with references to the specified `AssetWrapper`, wrapped punks contract,
and original CryptoPunks contract.

### `function depositPunk(uint256 punkIndex, uint256 bundleId) external`

Wrap and deposit an original cryptopunk into an AssetWrapper bundle. The `punkIndex` is the
punk ID, and the `bundleId` is the token ID of the bundle within the `AssetWrapper`
contract.

Requirements:

- The CryptoPunk at `punkIndex` must be offered for sale to this address for 0 ETH. This
  is equivalent to an approval for normal ERC721s - see the [CryptoPunks smart contract](https://github.com/larvalabs/cryptopunks/blob/master/contracts/CryptoPunksMarket.sol#L148) for more information.
- `msg.sender` must be the owner of the punk at `punkIndex`.

### `withdrawPunk(uint256 punkIndex, address to) external`

Withdraw a punk that is accidentally held by the PunkRouter contract,
maybe due to a mistaken send. Can only be called by admin. Transfers
the punk to `to`.
