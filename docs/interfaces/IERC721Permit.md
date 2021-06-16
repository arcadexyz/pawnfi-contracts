## `IERC721Permit`

Interface for a permittable ERC721 contract
See https://eips.ethereum.org/EIPS/eip-2612[EIP-2612].

Adds the {permit} method, which can be used to change an account's ERC72 allowance (see {IERC721-allowance}) by
presenting a message signed by the account. By not relying on {IERC721-approve}, the token holder account doesn't
need to send a transaction, and thus is not required to hold Ether at all.

### `permit(address owner, address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s)` (external)

Allows `spender` to spend `tokenID` which is owned by`owner`,
given `owner`'s signed approval.

Emits an {Approval} event.

Requirements:

- `spender` cannot be the zero address.
- `owner` must be the owner of `tokenId`.
- `deadline` must be a timestamp in the future.
- `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
  over the EIP712-formatted function arguments.
- the signature must use `owner`'s current nonce (see {nonces}).

For more information on the signature format, see the
https://eips.ethereum.org/EIPS/eip-2612#specification[relevant EIP
section].

### `nonces(address owner) → uint256` (external)

Returns the current nonce for `owner`. This value must be
included whenever a signature is generated for {permit}.

Every successful call to {permit} increases `owner`'s nonce by one. This
prevents a signature from being used multiple times.

### `DOMAIN_SEPARATOR() → bytes32` (external)

Returns the domain separator used in the encoding of the signature for {permit}, as defined by {EIP712}.
