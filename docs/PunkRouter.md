# ⤴️ PunkRouter

`PunkRouter` contract is used to allow users to automatically wrap and deposit original cryptopunks into the `AssetWrapper`.

## Contract API

```
constructor(
  IAssetWrapper _assetWrapper,
  IWrappedPunks _wrappedPunks,
  IPunks _punks
) {
  assetWrapper = _assetWrapper;
  punks = _punks;
  wrappedPunks = _wrappedPunks;
  wrappedPunks.registerProxy();
  proxy = wrappedPunks.proxyInfo(address(this));
}
```

Constructor is to set `assetWrapper`, `wrappedPunks` and `punks` addresses.
The original crypto punks are not ERC721 compatible so we will be using wrapped punks.
To do that, we will register a new proxy.

```
function depositPunk(uint256 punkIndex, uint256 bundleId) external
```

This function is used to wrap and deposit and original cryptopunk into the `assetWrapper` bundle.

- `punkIndex` - the index of the CryptoPunk to deposit
- `bundleId` - the id of the wNFT to deposit into
- CryptoPunk `punkIndex` must be offered for sale to this address for 0 ETH. This is a bit tricky(equivalent to an approval for normal ERC721s). Because the original CryptoPunk are is not ERC721 compatible.
- `msg.sender` should be the owner of `punkIndex`

```
function withdrawPunk(uint256 punkIndex, address to) external onlyOwner {
```

This function is for the owner of the contract. Cryptopunks have high prices so this is just for emergency withdraw. We should have off-chain information regarding punkIndex and ownership.
