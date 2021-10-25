# `LoanCore`

LoanCore contract - core contract for creating, repaying, and claiming collateral for PawnFi loans.

## Data Types

```
/**
* Enum describing the current state of a loan.
* State change flow:
*  Created -> Active -> Repaid
*                    -> Defaulted
*/
enum LoanState {
    // We need a default that is not 'Created' - this is the zero value
    DUMMY_DO_NOT_USE,
    // The loan data is stored, but not initiated yet.
    Created,
    // The loan has been initialized, funds have been delivered to the borrower and the collateral is held.
    Active,
    // The loan has been repaid, and the collateral has been returned to the borrower. This is a terminal state.
    Repaid,
    // The loan was delinquent and collateral claimed by the lender. This is a terminal state.
    Defaulted
}

/**
* The raw terms of a loan
*/
struct LoanTerms {
    // The number of seconds representing relative due date of the loan
    uint256 durationSecs;
    // The amount of principal in terms of the payableCurrency
    uint256 principal;
    // The amount of interest in terms of the payableCurrency
    uint256 interest;
    // The tokenID of the collateral bundle
    uint256 collateralTokenId;
    // The payable currency for the loan principal and interest
    address payableCurrency;
}

/**
* The data of a loan. This is stored once the loan is Active
*/
struct LoanData {
    // The tokenId of the borrower note
    uint256 borrowerNoteId;
    // The tokenId of the lender note
    uint256 lenderNoteId;
    // The raw terms of the loan
    LoanTerms terms;
    // The current state of the loan
    LoanState state;
    // Timestamp representing absolute due date date of the loan
    uint256 dueDate;
}
```

## API
### `constructor(contract IERC721 _collateralToken, contract IFeeController _feeController)` (public)

Create the `LoanCore` contract. Requires references to `_collateralToken` (an instance of `AssetWrapper`)
and `_feeController` (an instance of `FeeController`).

The constructor will grant `DEFAULT_ADMIN_ROLE` and `FEE_CLAIMER_ROLE` to the deployer. It will also
deploy two instances of `PromissoryNote` - one for the `borrowerNote` and one for the `lenderNote`.

### `getLoan(uint256 loanId) → struct LoanData loanData` (external)

Get LoanData by loanId (see `LoanData` struct definitiona above).

### `createLoan(struct LoanTerms terms) → uint256 loanId` (external)

Create a loan object with the given terms. This function created a loan record
in memory and reserves the collateral so it cannot be used by other loans, but
does not start the loan or issue principal.

Can only be called by `ORIGINATOR_ROLE` (should be an instance of `OriginationController`).

Emits a `LoanCreated` event.

### `startLoan(address lender, address borrower, uint256 loanId)` (external)

Start a loan with the given borrower and lender, using the terms of the
`loanId` already instantiated in `createLoan`.

`LoanCore` will withdraw the `collateralToken` and `principal` from the caller,
who should already have collected those assets from borrower and lender,
and approved `LoanCore` for withdrawal.

Distributes the principal less the protocol fee to the borrower.

Requirements:

- Can only be called by `ORIGINATOR_ROLE` (should be an instance of `OriginationController`).

Emits a `LoanStarted` event.

### `repay(uint256 loanId)` (external)

Repay the given loan for the specified `loanId`.

`LoanCore` will withdraw the repayment amount (principal + interest) from
the caller, which should already have collected those assets from the borrower.

The repaid tokens will be distributed to the lender, and the collateral token
redistributed the borrower.

On a completed loan repayment the corresponding `LenderNote` and `BorrowerNote`
tokens for the loan are burned.

Requirements:

- Can only be called by `REPAYER_ROLE` (should be an instance of `RepaymentController`).
- The loan must be in state `Active`.
- The caller must have approved `LoanCore` to withdraw tokens.

Emits a `LoanRepaid` event.

### `claim(uint256 loanId)` (external)

Claim the collateral of the given loan, as long as the loan has not been repaid by the
due date.

The collateral token will be distributed to the lender, and the `LenderNote` and
`BorrowerNote` burned.

Requirements:

- Can only be called by `REPAYER_ROLE` (should be an instance of `RepaymentController`).
- The loan must be in state `Active`.
- The current time must be beyond the `dueDate` of the loan.

Emits a `LoanClaimed` event.

### `getPrincipalLessFees(uint256 principal) → uint256` (internal)

Take a principal value and return the amount less protocol fees. Reads from
`FeeController` to get the current origination fee value.

### `setFeeController(contract IFeeController _newController)` (external)

Set the fee controller to a new value. The new argument must support
the `FeeController` interface.

Requirements:

- Can only be called by `FEE_CLAIMER_ROLE`.

### `claimFees(contract IERC20 token)` (external)

Claim the protocol fees for the given token. All fees will be withdrawn
to the caller.

Requirements:

- Can only be called by `FEE_CLAIMER_ROLE`.

Emits a `FeesClaimed` event.

## Events