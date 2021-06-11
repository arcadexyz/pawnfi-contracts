pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";

import "../interfaces/ILoanCore.sol";
import "../interfaces/IPromissoryNote.sol";

import "../PromissoryNote.sol";

/**
 * @dev Interface for the LoanCore contract
 */
contract MockLoanCore is ILoanCore {    
    using Counters for Counters.Counter;
    Counters.Counter private loanIdTracker;

    IPromissoryNote public borrowerNote;
    IPromissoryNote public lenderNote;

    mapping(uint256 => LoanData.LoanData) public loans;

    constructor() {
        borrowerNote = new PromissoryNote("Mock BorrowerNote", "MB");
        lenderNote = new PromissoryNote("Mock LenderNote", "ML");

        // Avoid having loanId = 0
        loanIdTracker.increment();

        emit Initialized(address(0), address(borrowerNote), address(lenderNote));
    }

    /**
     * @dev Get LoanData by loanId
     */
    function getLoan(uint256 loanId) public view override returns (LoanData.LoanData memory _loanData) {
        return loans[loanId];
    }

    /**
     * @dev Create store a loan object with some given terms
     */
    function createLoan(LoanData.LoanTerms calldata terms) external override returns (uint256 loanId) {
        LoanData.LoanTerms memory _loanTerms =
            LoanData.LoanTerms(terms.dueDate, terms.principal, terms.interest, terms.collateralTokenId, terms.payableCurrency);

        LoanData.LoanData memory _loanData = LoanData.LoanData(0, 0, _loanTerms, LoanData.LoanState.Created);

        loanId = loanIdTracker.current();
        loanIdTracker.increment();

        loans[loanId] = _loanData;

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
        address lender,
        address borrower,
        uint256 loanId
    ) public override {
        uint256 borrowerNoteId = borrowerNote.mint(borrower, loanId);
        uint256 lenderNoteId = lenderNote.mint(lender, loanId);

        LoanData.LoanData memory data = loans[loanId];
        loans[loanId] = LoanData.LoanData(borrowerNoteId, lenderNoteId, data.terms, LoanData.LoanState.Active);

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
        loans[loanId].state = LoanData.LoanState.Repaid;
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
