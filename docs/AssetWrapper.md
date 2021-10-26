# `AssetWrapper`

The AssetWrapper contract is a generalized bundle
mechanism for ERC20, ERC721, and ERC1155 assets.

Users can create new bundles, which grants them an NFT to
reclaim all assets stored in the bundle. They can then
store various types of assets in that bundle. The bundle NFT
can then be used or traded as an asset in its own right.
At any time, the holder of the bundle NFT can redeem it for the
underlying assets.

## API

### `initializeBundle(address to) →` _(external)_

Creates a new bundle token for `to`. Its token ID will be
automatically assigned returned, and available on the emitted `Transfer` event.

See [ERC721-\_safeMint](https://docs.openzeppelin.com/contracts/3.x/api/token/erc721#ERC721-_safeMint-address-uint256-).

### `depositERC20(address tokenAddress, uint256 amount, uint256 bundleId)` _(external)_

Deposit ERC20 tokens into a given bundle.

Requirements:

- The bundle with ID `bundleId` must have been initialized with `initializeBundle`.
- The tokens for deposit must be approved for withdrawal by the
  `AssetWrapper` contract.

Emits a `DepositERC20` event.

### `depositERC721(address tokenAddress, uint256 tokenId, uint256 bundleId)` _(external)_

Deposit an ERC721 token into a given bundle.

Requirements:

- The bundle with ID `bundleId` must have been initialized with `initializeBundle`.
- The NFT for deposit must be approved for withdrawal by the
  `AssetWrapper` contract.

Emits a `DepositERC721` event.

### `depositERC1155(address tokenAddress, uint256 tokenId, uint256 amount, uint256 bundleId)` _(external)_

Deposit an ERC1155 token into a given bundle.

Requirements:

- The bundle with ID `bundleId` must have been initialized with `initializeBundle`.
- The NFT for deposit must be approved for withdrawal of `amount` by the
  `AssetWrapper` contract.

Emits a `DepositERC1155` event.

### `depositETH(uint256 bundleId)` _(external)_

Deposit ETH into a given bundle. ETH should be sent in `msg.value`.

Requirements:

- The bundle with ID `bundleId` must have been initialized with `initializeBundle`.

Emits a `DepositETH` event.

### `withdraw(uint256 bundleId)` _(external)_

Withdraw all assets in the given bundle, returning them to `msg.sender`.

Requirements:

- The bundle with ID `bundleId` must have been initialized with `initializeBundle`.
- The bundle with ID `bundleId` must be owned by or approved to `msg.sender`.

Emits a `Withdraw` event.

### `_beforeTokenTransfer(address from, address to, uint256 tokenId)` _(internal)_

Hook that is called before any token transfer.

See [IERC721-\_beforeTokenTransfer](https://docs.openzeppelin.com/contracts/3.x/api/token/erc721#ERC721-_beforeTokenTransfer-address-address-uint256-).

### `supportsInterface(bytes4 interfaceId) → bool` _(pubic)_

See [IERC165-supportsInterface](https://docs.openzeppelin.com/contracts/3.x/api/introspection#IERC165-supportsInterface-bytes4-).

## Events

### `DepositERC20(address indexed depositor, uint256 indexed bundleId, address tokenAddress, uint256 amount)`

Emitted when an ERC20 token is deposited to the specified `bundleId`.

### `DepositERC721(address indexed depositor, uint256 indexed bundleId, address tokenAddress, uint256 tokenId)`

Emitted when an ERC721 token is deposited to the specified `bundleId`.

### `DepositERC1155(address indexed depositor, uint256 indexed bundleId, address tokenAddress, uint256 tokenId, uint256 amount)`

Emitted when an ERC1155 token is deposited to the specified `bundleId`.

### `DepositETH(address indexed depositor, uint256 indexed bundleId, uint256 amount)`

Emitted when ETH is deposited to the specified `bundleId`.

### `Withdraw(address indexed withdrawer, uint256 indexed bundleId)`

Emitted when a bundle is unwrapped, transferring all bundled assets back to the owner.
