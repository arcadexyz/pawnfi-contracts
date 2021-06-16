## `LoanCore`

LoanCore contract - core contract for creating, repaying, and claiming collateral for PawnFi loans

### `constructor(contract INote _borrowerNote, contract INote _lenderNote, contract IERC721 _collateralToken, contract IFeeController _feeController)` (public)

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

### `tokensReceived(contract IERC20 token) → uint256 amount` (internal)

Check the amount of tokens received for a given ERC20 token since last checked

### `updateTokenBalance(contract IERC20 token)` (internal)

Update the internal state of our token balance for the given token

### `getPrincipalLessFees(uint256 principal) → uint256` (internal)

Take a principal value and return the amount less protocol fees

### `setFeeController(contract IFeeController _newController)` (external)

Set the fee controller to a new value

Requirements:

- Must be called by the owner of this contract

### `claimFees(contract IERC20 token)` (external)

Claim the protocol fees for the given token
