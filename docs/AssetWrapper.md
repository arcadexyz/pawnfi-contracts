## `AssetWrapper`

{ERC721} token allowing users to create bundles of assets.

Users can create new bundles, which grants them an NFT to
reclaim all assets stored in the bundle. They can then
store various types of assets in that bundle. The bundle NFT
can then be used or traded as an asset in its own right.
At any time, the holder of the bundle NFT can redeem it for the
underlying assets.

### `constructor(string name, string symbol)` (public)

Initializes the token with name and symbol parameters

### `initializeBundle(address to)` (external)

Creates a new bundle token for `to`. Its token ID will be
automatically assigned (and available on the emitted {IERC721-Transfer} event)

See {ERC721-\_mint}.

### `depositERC20(address tokenAddress, uint256 amount, uint256 bundleId)` (external)

Deposit some ERC20 tokens into a given bundle

Requirements:

- The bundle with id `bundleId` must have been initialized with {initializeBundle}
- `amount` tokens from `msg.sender` on `tokenAddress` must have been approved to this contract

### `depositERC721(address tokenAddress, uint256 tokenId, uint256 bundleId)` (external)

Deposit an ERC721 token into a given bundle

Requirements:

- The bundle with id `bundleId` must have been initialized with {initializeBundle}
- The `tokenId` NFT from `msg.sender` on `tokenAddress` must have been approved to this contract

### `depositERC1155(address tokenAddress, uint256 tokenId, uint256 amount, uint256 bundleId)` (external)

Deposit an ERC1155 token into a given bundle

Requirements:

- The bundle with id `bundleId` must have been initialized with {initializeBundle}
- The `tokenId` from `msg.sender` on `tokenAddress` must have been approved for at least `amount`to this contract

### `depositETH(uint256 bundleId)` (external)

Deposit some ETH into a given bundle

Requirements:

- The bundle with id `bundleId` must have been initialized with {initializeBundle}

### `withdraw(uint256 bundleId)` (external)

Withdraw all assets in the given bundle, returning them to the msg.sender

Requirements:

- The bundle with id `bundleId` must have been initialized with {initializeBundle}
- The bundle with id `bundleId` must be owned by or approved to msg.sender

### `_beforeTokenTransfer(address from, address to, uint256 tokenId)` (internal)

Hook that is called before any token transfer

### `supportsInterface(bytes4 interfaceId) → bool` (public)

See {IERC165-supportsInterface}.
