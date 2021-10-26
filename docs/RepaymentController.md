# `RepaymentController`

The RepaymentController is a periphery-style contract that allows interactions
with `LoanCore` for the purposes of repaying or claiming defaulted loans.

While `LoanCore` maintains the invariants of owed tokens and collateral for
valid loan state, `RepaymentController` is responsible for checking that tokens
have been approved for withdrawal and repayment before `LoanCore` operations.

### API

### `constructor(ILoanCore _loanCore, IPromissoryNote _borrowerNote, IPromissoryNote _lenderNote)`

Deploys the contract with references to the specified `LoanCore` and `PromissoryNote`
contracts.

### `repay(uint256 borrowerNoteId) external`

Called by the borrower to repay a currently active loan. Withdraws
repayment tokens and delegates logic to `LoanCore-repay`. Caller sends
`borrowerNoteId` to reference the loan, which is then dereferenced to a loan ID.

Requirements:

- The loan must be in the `Active` state.
- The repayment amount must be approved for withdrawal by the `RepaymentController`.

### `claim(uint256 lenderNoteId) external`

Used by the lender to claim collateral for a loan that is in default. Caller sends
`lenderNoteId` to reference the loan, which is then dereferenced to a loan ID.
Sends the associated collateral token back to the holder of the `LenderNote.`

Requirements:

- The loan must be in the `Active` state.
- The current time must be greater than the loan's due date.
- The caller must be the owner of the associated `LenderNote`.
