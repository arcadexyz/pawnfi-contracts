# `FlashRollover`

Implementation of a loan rollover/refinance using [AAVE Flash Loans]([AAVE Flash Loan](https://docs.aave.com/faq/flash-loans).

Borrowers with a currently opne loan can collect a signature from their lender on new loan terms off-chain,
then provide the desired new terms to the rollover contract. The contract will execute a flash loan to
pay back their currently open loan, originate a new loan, then use the proceeds from the new loan to repay
the flash loan. Borrowers are responsible for paying the difference between any new loan and the owed flash
loan amount.

Rollovers can also migrate a loan from one instance of the `LoanCore` contract to a new one, using the `isLegacy` flag.
This can be useful if updates or fixes are made to `LoanCore` and the protocol is re-deployed.

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
