## `IAssetWrapper`

Interface for an AssetWrapper contract

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

### `DepositERC20(address depositor, uint256 bundleId, address tokenAddress, uint256 amount)`

Emitted when an ERC20 token is deposited

### `DepositERC721(address depositor, uint256 bundleId, address tokenAddress, uint256 tokenId)`

Emitted when an ERC721 token is deposited

### `DepositERC1155(address depositor, uint256 bundleId, address tokenAddress, uint256 tokenId, uint256 amount)`

Emitted when an ERC1155 token is deposited

### `DepositETH(address depositor, uint256 bundleId, uint256 amount)`

Emitted when ETH is deposited

### `Withdraw(address withdrawer, uint256 bundleId)`

Emitted when ETH is deposited
