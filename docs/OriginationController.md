# `OriginationController`

The OriginationController is a periphery-style contract that allows interactions
with `LoanCore` for the purposes of initializing loans.

While `LoanCore` maintains the invariants of owed tokens and collateral for
valid loan state, `OriginationController` is responsible for checking mutual
loan consent by verifying the required signatures for loan creation.

### API

### `constructor(address _loanCore, address _assetWrapper)`

Deploys the contract with references to the specified `LoanCore` and `AssetWrapper`
contracts. Also initializes a domain separator and version for `EIP712` signatures
for collateral permits.

### `intializeLoan`

```
function initializeLoan(
    LoanLibrary.LoanTerms calldata loanTerms,
    address borrower,
    address lender,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;
```

Initializes a loan with `LoanCore`. See the `LoanCore` documentation for the `LoanTerms`
data type. Validates the signature against the submitted terms, then withdraws principal
from the lender, and the collateral from the borrower. Approves `LoanCore` to then
withdraw the associated principal and collateral, and calls the loan initiation functions
in `LoanCore`.

Requirements:

- The caller must be the borrower or lender.
- The external signer must not be `msg.sender`.
- The external signer must be the borrower or lender.
- The collateral must be approved with withdrawal by the `OriginationController`.

### `initializeLoanWithCollateralPermit`

```
function initializeLoanWithCollateralPermit(
    LoanLibrary.LoanTerms calldata loanTerms,
    address borrower,
    address lender,
    uint8 v,
    bytes32 r,
    bytes32 s,
    uint8 collateralV,
    bytes32 collateralR,
    bytes32 collateralS,
    uint256 permitDeadline
) external;
```

Calls `ERC721-permit` on the `AssetWrapper` using the collateral permit signature
to approve collateral withdrawal. Does not require on-chain pre-approval.

After permission for the collateral withdrawal is validated, logic is delegated
to `initializeLoan`.

Requirements:

- The caller must be the borrower or lender.
- The external signer must not be `msg.sender`.
- The external signer must be the borrower or lender.
- The collateral signature must match the specified `collateralTokenId` and be from the borrower.
