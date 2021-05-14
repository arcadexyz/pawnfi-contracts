pragma solidity ^0.8.0;

import "../interfaces/ILoanCore.sol";

/**
 * @dev Interface for the LoanCore contract
 */
contract MockLoanCore is ILoanCore {
    /**
     * @dev Get LoanData by loanId
     */

    mapping(uint256 => LoanData) public loanData;

    function getLoan(uint256 loanId) public view override returns (LoanData memory _loanData) {
        _loanData = loanData[loanId];
        return _loanData;
    }

    /**
     * @dev Create store a loan object with some given terms
     */
    function createLoan(LoanTerms calldata terms) external override returns (uint256 loanId) {
        LoanTerms memory _loanTerms =
            LoanTerms(terms.dueDate, terms.principal, terms.interest, terms.collateralTokenId, terms.payableCurrency);

        loanId = 1;

        LoanData memory _loanData = LoanData(0, 0, _loanTerms, LoanState.Created);

        loanData[loanId] = _loanData;

        emit LoanCreated(terms, loanId);

        return loanId;
    }

    /**
     * @dev Start a loan with the given borrower and lender
     *  Distributes the principal less the protocol fee to the borrower
     *
     * Requirements:
     *  - This function can only be called by a whitelisted OriginationController
     *  - The proper principal and collateral must have been sent to this contract before calling.
     */
    function startLoan(
        uint256 loanId, 
        address lender,
        address borrower
    ) public override {
        loanData[loanId].state = LoanState.Active;
        emit LoanStarted(loanId, lender, borrower);
    }

    /**
     * @dev Repay the given loan
     *
     * Requirements:
     *  - The caller must be a holder of the borrowerNote
     *  - The caller must send in principal + interest
     *  - The loan must be in state Active
     */
    function repay(uint256 loanId) public override {
        loanData[loanId].state = LoanState.Repaid;
        emit LoanRepaid(loanId);
    }

    /**
     * @dev Claim the collateral of the given delinquent loan
     *
     * Requirements:
     *  - The caller must be a holder of the lenderNote
     *  - The loan must be in state Active
     *  - The current time must be beyond the dueDate
     */
    function claim(uint256 loanId) public override {}
}
