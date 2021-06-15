## `MockERC721`

### `constructor(string name, string symbol)` (public)

Initializes ERC721 token

### `mint(address to) → uint256 tokenId` (external)

Creates a new token for `to`. Public for any test to call.

See {ERC721-\_mint}.

### `burn(uint256 tokenId)` (external)

Burn the given token, can be called by anyone
