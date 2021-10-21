# ⤴️ OriginationController

## Contract API

```
constructor(address _loanCore, address _assetWrapper) EIP712("OriginationController", "1") {
  require(_loanCore != address(0), "Origination: loanCore not defined");
  loanCore = _loanCore;
  assetWrapper = _assetWrapper;
}
```

Constructor with `loanCore` and `assetWrapper` addresses. The `loanCore` param shouldn't be the address(0).

```
function initializeLoan(
  LoanLibrary.LoanTerms calldata loanTerms,
  address borrower,
  address lender,
  uint8 v,
  bytes32 r,
  bytes32 s
) public override {
```

This function is used to initialize the loan with loanTerms params.
The `_msgSender()` should be either `borrower` or `lender` here.

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
) external override {
```

This function is used to initialize the loan with the collateral permit.
This will use `initializeLoan` function.
