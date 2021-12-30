## `MockLoanCore`

Interface for the LoanCore contract

### `getLoan(uint256 loanId) → struct LoanData _loanData` (public)

### `createLoan(struct LoanTerms terms) → uint256 loanId` (external)

Create store a loan object with some given terms

### `startLoan(address lender, address borrower, uint256 loanId)` (public)

Start a loan with the given borrower and lender
Distributes the principal less the protocol fee to the borrower

Requirements:

- This function can only be called by a whitelisted OriginationController
- The proper principal and collateral must have been sent to this contract before calling.

### `repay(uint256 loanId)` (public)

Repay the given loan

Requirements:

- The caller must be a holder of the borrowerNote
- The caller must send in principal + interest
- The loan must be in state Active

### `claim(uint256 loanId)` (public)

Claim the collateral of the given delinquent loan

Requirements:

- The caller must be a holder of the lenderNote
- The loan must be in state Active
- The current time must be beyond the dueDate
