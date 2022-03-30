// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Counters.sol";

import "../interfaces/ILoanCoreV2.sol";
import "../interfaces/IPromissoryNote.sol";

import "../PromissoryNote.sol";

/**
 * @dev Interface for the LoanCoreV2 contract
 */
contract MockLoanCore is ILoanCoreV2 {
    using Counters for Counters.Counter;
    Counters.Counter private loanIdTracker;

    IPromissoryNote public override borrowerNote;
    IPromissoryNote public override lenderNote;
    IERC721 public override collateralToken;
    IFeeController public override feeController;

    mapping(uint256 => LoanLibraryV2.LoanData) public loans;

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
    function getLoan(uint256 loanId) public view override returns (LoanLibraryV2.LoanData memory _loanData) {
        return loans[loanId];
    }

    /**
     * @dev Create store a loan object with some given terms
     */
    function createLoan(LoanLibraryV2.LoanTerms calldata terms) external override returns (uint256 loanId) {
        LoanLibraryV2.LoanTerms memory _loanTerms = LoanLibraryV2.LoanTerms(
            terms.durationSecs,
            terms.principal,
            terms.interest,
            terms.collateralTokenId,
            terms.payableCurrency,
            terms.startDate,
            terms.numInstallments
        );

        LoanLibraryV2.LoanData memory _loanData = LoanLibraryV2.LoanData(
            0,
            0,
            _loanTerms,
            LoanLibraryV2.LoanState.Created,
            terms.durationSecs,
            terms.principal,
            0,
            0,
            0,
            0
        );

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

        LoanLibraryV2.LoanData memory data = loans[loanId];
        loans[loanId] = LoanLibraryV2.LoanData(
            borrowerNoteId,
            lenderNoteId,
            data.terms,
            LoanLibraryV2.LoanState.Active,
            data.dueDate,
            data.balance,
            data.balancePaid,
            data.lateFeesAccrued,
            data.numMissedPayments,
            data.numInstallmentsPaid
        );

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
        loans[loanId].state = LoanLibraryV2.LoanState.Repaid;
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

    /**
     * @dev Called from RepaymentController when paying back installment loan.
     * Function takes in the loanId and amount repaid to RepaymentController.
     * This amount is then transferred to the lender and loan data is updated accordingly.
     */
    function repayPart(
        uint256 _loanId,
        uint256 _repaidAmount,
        uint256 _numMissedPayments,
        uint256 _lateFeesAccrued
    ) external override {
        LoanLibraryV2.LoanData memory data = loans[_loanId];
        // Ensure valid initial loan state
        require(data.state == LoanLibraryV2.LoanState.Active, "LoanCoreV2::repay: Invalid loan state");
        data.state = LoanLibraryV2.LoanState.Repaid;

        emit LoanRepaid(_loanId);
    }
}
