# ⤴️ RepaymentController

`RepaymentController` contract is used to repay the loans.

## Contract API

```
constructor(
  ILoanCore _loanCore,
  IPromissoryNote _borrowerNote,
  IPromissoryNote _lenderNote
)
```

Constructor is to set `loanCore`, `borrowerNote` and `lenderNote`.

```
function repay(uint256 borrowerNoteId) external override
```

This function is used to repay the loan.

- `borrowerNoteId` - the index of the borrowerNote

This function will look for the loan by using the `borrowerNoteId` sent.

```
uint256 loanId = borrowerNote.loanIdByNoteId(borrowerNoteId);
```

And this function will withdraw principal plus interest from the borrower and send it to loan core contract.

```
function claim(uint256 lenderNoteId) external override
```

- `lenderNoteId` - the index of the lenderNote

This function is for lender side.
