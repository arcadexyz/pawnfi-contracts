## `MockERC1155`

### `constructor()` (public)

Initializes ERC1155 token

### `mint(address to, uint256 amount)` (public)

Creates `amount` tokens of token type `id`, and assigns them to `account`.

Emits a {TransferSingle} event.

Requirements:

- `account` cannot be the zero address.
- If `account` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
  acceptance magic value.
