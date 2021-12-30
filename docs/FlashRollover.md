# `FlashRollover`

Implementation of a loan rollover/refinance using [AAVE Flash Loans]([AAVE Flash Loan](https://docs.aave.com/faq/flash-loans).

Borrowers with a currently open loan can collect a signature from their lender on new loan terms off-chain,
then provide the desired new terms to the rollover contract. The contract will execute a flash loan to
pay back their currently open loan, originate a new loan, then use the proceeds from the new loan to repay
the flash loan. Borrowers are responsible for paying the difference between any new loan and the owed flash
loan amount.

Rollovers can also migrate a loan from one instance of the `LoanCore` contract to a new one, using the `isLegacy` flag.
This can be useful if updates or fixes are made to `LoanCore` and the protocol is re-deployed.

## Data Types

```
/**
 * Holds parameters passed through flash loan
 * control flow that dictate terms of the new loan.
 * Contains a signature by lender for same terms.
 * isLegacy determines which loanCore to look for the
 * old loan in.
 */
struct OperationData {
    bool isLegacy;
    uint256 loanId;
    LoanLibrary.LoanTerms newLoanTerms;
    uint8 v;
    bytes32 r;
    bytes32 s;
}

/**
 * Defines the contracts that should be used for a
 * flash loan operation. May change based on if the
 * old loan is on the current loanCore or legacy (in
 * which case it requires migration).
 */
struct OperationContracts {
    ILoanCore loanCore;
    IERC721 borrowerNote;
    IERC721 lenderNote;
    IFeeController feeController;
    IERC721 assetWrapper;
    IRepaymentController repaymentController;
    IOriginationController originationController;
    ILoanCore newLoanLoanCore;
    IERC721 newLoanBorrowerNote;
}
```

## API

### `constructor`

```
constructor(
    ILendingPoolAddressesProvider provider,
    ILoanCore loanCore,
    ILoanCore legacyLoanCore,
    IOriginationController originationController,
    IRepaymentController repaymentController,
    IRepaymentController legacyRepaymentController,
    IERC721 borrowerNote,
    IERC721 legacyBorrowerNote,
    IERC721 lenderNote,
    IERC721 legacyLenderNote,
    IERC721 assetWrapper,
    IFeeController feeController
);
```

Initializes the `FlashRollover` contract with the addresses of all contracts it depends on. Some contracts need both
legacy and current versions for migration purposes. Once set, these contract values cannot be changed.

### `rolloverLoan` _(external)_

```
function rolloverLoan(
    bool isLegacy,
    uint256 loanId,
    LoanLibrary.LoanTerms calldata newLoanTerms,
    uint8 v,
    bytes32 r,
    bytes32 s
) external;
```

Executes a loan rollover using a flash loan.

The argument `isLegacy` should be set to `true` if the loan needs to migrate from an old `LoanCore` deployment to a new one.
Use this if the loan is being currently managed by a `LoanCore` contract whose address does not match our
[current contract address](https://docs.pawn.fi/docs/contract-addresses). The signature `v`, `r`, `s` should be an
[EIP-712 typed signature](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/draft-EIP712.sol)
whose payload matches the `newLoanTerms`. `loanId` should be the loan that will be closed and rolled over.

Requirements:

- Must be called by the loan's borrower.
- New loan terms must use same `collateralTokenId` as old loan.
- New loan terms must use the same `payableCurrency` as old loan.
- If new principal cannot repay flash loan, borrower must `approve` balance due for withdrawal by `FlashRollover` contract.

### `executeOperation` _(external)_

```
function executeOperation(
    address[] calldata assets,
    uint256[] calldata amounts,
    uint256[] calldata premiums,
    address initiator,
    bytes calldata params
) external returns (bool)
```

Callback used by AAVE lending pool when a flash loan is executed. [See documentation](https://docs.aave.com/developers/guides/flash-loans#2.-calling-flashloan).

At the beginning of this function, the rollover contract has the flashloan funds. The contract must contain enough funds at the end
of the function to repay the loan, or the transaction will fail. `executeOperation` for a flash rollover will close out the old loan
and begin a new one.

Requirements:

- Caller must be the AAVE lending pool.
- Initiator of the flash loan must be the rollover contract.
- The contract must have a balance greater than or equal to the specified funds at the start of the loan.

Emits a `Rollover` event. If the rollover is a legacy migration, also emits `Migration` event.

### `_executeOperation` _(internal)_

```
function _executeOperation(
    address[] calldata assets,
    uint256[] calldata amounts,
    uint256[] calldata premiums,
    OperationData memory opData
) internal returns (bool)
```

Encapsulated logic for handling the AAVE flash loan callback. `_executeOperation`
relies on a number of helper functions to complete the following steps:

1. Determine the appropriate contracts via `_getContracts` (depending on whether the rollover includes a legacy migration).
2. Get the loan details and identify borrower and lender.
3. Ensure proper accounting via `_ensureFunds`.
4. Repay the old loan with `_repayLoan`.
5. Initialize a new loan with `_initializeNewLoan`.
6. Settle accounting with borrower, either sending leftover or collecting balance needed for flash loan repayment.
7. Approve the lending pool to withdraw the amount due from the flash loan.

This is the core logic of the contract.

### `_getContracts(bool isLegacy) → OperationContracts` _(internal)_

Returns the set of contracts needed for the operation, inside
the struct defined by `OperationContracts`. Returns a different result
based on whether the loan requires a legacy rollover. For a legacy rollover,
the execution context needs to be aware of the legacy `LoanCore`, `BorrowerNote`,
`LenderNote`, and `RepaymentController` addresses.

### `_ensureFunds` _(internal)_

```
function _ensureFunds(
    uint256 amount,
    uint256 premium,
    uint256 originationFee,
    uint256 newPrincipal
)
    internal
    pure
    returns (
        uint256 flashAmountDue,
        uint256 needFromBorrower,
        uint256 leftoverPrincipal
    )
```

Perform the computations needed to determine:

1. `flashAmountDue` - the amount that will be owed to AAVE at the end of `executeOperation`.
2. `needFromBorrower` - if new loan's principal is less than the flash amount due, the amount that the contract will attempt to withdraw from the borrower to repay AAVE.
3. `leftoverPrincipal` - if new loan's principal is more than the flash amount due, the amount that the contract will disburse to the borrower after the loan is rolled over.

Note that either `needFromBorrower` or `leftoverPrincipal` should return 0, since they are computed in mutually exclusive situations.

### `_repayLoan` _(internal)_

```
function _repayLoan(
    OperationContracts memory contracts,
    LoanLibrary.LoanData memory loanData
) internal
```

Perform the actions needed to repay the existing loan. When this function
runs in the context of `_executeOperation`, it should have enough funds
from flash loan proceeds to repay the loan. The function will withdraw the borrower
note from the borrower, approve the withdrawal by the repayment controller of
the owed funds, and call `RepaymentController` to repay the loan. It will
then verify that it now owns the relevant `collateralTokenId` as the success
condition of repayment.

### `_initializeNewLoan` _(internal)_

```
function _initializeNewLoan(
    OperationContracts memory contracts,
    address borrower,
    address lender,
    uint256 collateralTokenId,
    OperationData memory opData
) internal returns (uint256)
```

Perform the actions needed to start a new loan. The `opData` struct should
contain all needed terms and signature information to start a loan with the
`OriginationController`. Once the loan is initialized, the borrower
note will be transferred to `borrower`.

### `setOwner(address _owner)` _(external)_

Sets a contract owner. The owner is the only party allowed to call `flushToken`.

Requirements:

- Must be called by current `owner`.

Emits a `SetOwner` event.

### `flushToken(IERC20 token, address to)` _(external)_

Send any ERC20 token balance held within the contract to a specified
address. Needed because balance checks for flash rollover assume
a starting and ending balance of 0 tokens. This prevents the contract
being frozen by a non-zero token balance (either unintentionally or
from a griefing attack).

Requirements:

- Must be called by current `owner`.

## Events

### `Rollover`

```
event Rollover(
    address indexed lender,
    address indexed borrower,
    uint256 collateralTokenId,
    uint256 newLoanId
)
```

Emitted when a loan is rolled over into a new loan.

### `Migration`

```
event Migration(
    address indexed oldLoanCore,
    address indexed newLoanCore,
    uint256 newLoanId
);
```

Emitted when a loan rollover migrates a loan from one instance of `LoanCore` to another.

### `SetOwner(address owner)`

Emitted when the contract owner is changed.
