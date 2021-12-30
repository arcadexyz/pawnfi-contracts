# `ERC721Permit`

Implementation of the ERC721 Permit extension allowing approvals to be made
via signatures, as defined in [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612).

See the [EIP-712 spec](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/draft-EIP712.sol).

This contract [IERC721](https://docs.openzeppelin.com/contracts/3.x/api/token/erc721#IERC721) by adding
the `permit` method, which can be used to change an account's ERC721 allowance (see `IERC721-allowance`)
by presenting a message signed by the account. By not relying on `IERC721-approve`, the token holder
account doesn't need to send a transaction, and thus is not required to hold Ether at all.

## API

### `constructor(string name)`

Initializes the `EIP712` domain separator using the `name` parameter, and setting `version` to `"1"`. `name` should be the same
as the `ERC721` token name.

### `permit(address owner, address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s)` _(public)_

Allows `spender` to spend `tokenID` which is owned by`owner`, given the signed approval of `owner`.

Requirements:

- `spender` cannot be the zero address.
- `owner` must be the owner of `tokenId`.
- `deadline` must be a timestamp in the future.
- `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
  over the EIP712-formatted function arguments.
- the signature must use `owner`'s current nonce (see {nonces}).

For more information on the signature format, see the
[relevant EIP section](https://eips.ethereum.org/EIPS/eip-2612#specification).

### `nonces(address owner) → uint256` _(public)_

Returns the current nonce for `owner`. This value must be
included whenever a signature is generated for `permit`.
Every successful call to `permit` increases `owner`'s nonce by one. This
prevents a signature from being used multiple times.

### `DOMAIN_SEPARATOR() → bytes32` _(external)_

Returns the domain separator used in the encoding of the signature for `permit`, as defined by [EIP712](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/draft-EIP712.sol).

### `_useNonce(address owner) → uint256 current` _(internal)_

Consumes a nonce: return the current nonce value for the owner and and increments it.
