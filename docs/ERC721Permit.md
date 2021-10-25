# `ERC721Permit`

Implementation of the ERC721 Permit extension allowing approvals to be made
via signatures, as defined in [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612).

See https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/draft-EIP712.sol

Adds the {permit} method, which can be used to change an account's ERC721 allowance (see {IERC721-allowance}) by
presenting a message signed by the account. By not relying on `{IERC721-approve}`, the token holder account doesn't
need to send a transaction, and thus is not required to hold Ether at all.

_Available since v3.4._

### `constructor(string name)` (internal)

Initializes the {EIP712} domain separator using the `name` parameter, and setting `version` to `"1"`.

It's a good idea to use the same `name` that is defined as the ERC721 token name.

### `permit(address owner, address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s)` (public)

See {IERC721-permit}.

### `nonces(address owner) → uint256` (public)

See {IERC721Permit-nonces}.

### `DOMAIN_SEPARATOR() → bytes32` (external)

See {IERC721Permit-DOMAIN_SEPARATOR}.

### `_useNonce(address owner) → uint256 current` (internal)

"Consume a nonce": return the current value and increment.

_Available since v4.1._
