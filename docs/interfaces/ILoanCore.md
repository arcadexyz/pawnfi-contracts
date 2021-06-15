## `ILoanCore`

Interface for the LoanCore contract

### `getLoan(uint256 loanId) → struct LoanData loanData` (external)

Get LoanData by loanId

### `createLoan(struct LoanTerms terms) → uint256 loanId` (external)

Create store a loan object with some given terms

### `startLoan(address lender, address borrower, uint256 loanId)` (external)

Start a loan with the given borrower and lender
Distributes the principal less the protocol fee to the borrower

Requirements:

- This function can only be called by a whitelisted OriginationController
- The proper principal and collateral must have been sent to this contract before calling.

### `repay(uint256 loanId)` (external)

Repay the given loan

Requirements:

- The caller must be a holder of the borrowerNote
- The caller must send in principal + interest
- The loan must be in state Active

### `claim(uint256 loanId)` (external)

Claim the collateral of the given delinquent loan

Requirements:

- The caller must be a holder of the lenderNote
- The loan must be in state Active
- The current time must be beyond the dueDate

### `LoanCreated(struct LoanTerms terms, uint256 loanId)`

Emitted when a loan is initially created

### `LoanStarted(uint256 loanId, address lender, address borrower)`

Emitted when a loan is started and principal is distributed to the borrower.

### `LoanRepaid(uint256 loanId)`

Emitted when a loan is repaid by the borrower

### `LoanClaimed(uint256 loanId)`

Emitted when a loan collateral is claimed by the lender

### `FeesClaimed(address token, address to, uint256 amount)`

Emitted when fees are claimed by admin
