// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LoanLibraryV2 {
    /**
     * @dev Enum describing the current state of a loan
     * State change flow:
     *  Created -> Active -> Repaid
     *                    -> Defaulted
     */
    enum LoanState {
        // We need a default that is not 'Created' - this is the zero value
        DUMMY_DO_NOT_USE,
        // The loan data is stored, but not initiated yet.
        Created,
        // The loan has been initialized, funds have been delivered to the borrower and the collateral is held.
        Active,
        // The loan has been repaid, and the collateral has been returned to the borrower. This is a terminal state.
        Repaid,
        // The loan was delinquent and collateral claimed by the lender. This is a terminal state.
        Defaulted
    }

    /**
     * @dev The raw terms of a loan.
     */
    struct LoanTerms {
        // The number of seconds representing relative due date of the loan
        // A loan of 0 duration has no due date - it is only governed by the installment period
        uint256 durationSecs;
        // The amount of principal in terms of the payableCurrency
        uint256 principal;
        // The amount of interest in terms of the payableCurrency current principal amount
        // Expressed as a APR (rate), unlike V1 gross value
        uint256 interest;
        // The tokenID of the collateral bundle
        uint256 collateralTokenId;
        // The payable currency for the loan principal and interest
        address payableCurrency;
        // Installment loan specific

        // Start date of the loan - used for determine what is due at each installment
        uint256 startDate;
        // number of installment periods within the total loan duration
        uint256 numInstallments;
    }

    /**
     * @dev The data of a loan. This is stored once the loan is Active
     */
    struct LoanData {
        // The tokenId of the borrower note
        uint256 borrowerNoteId;
        // The tokenId of the lender note
        uint256 lenderNoteId;
        // The raw terms of the loan
        LoanTerms terms;
        // The current state of the loan
        LoanState state;
        // Timestamp representing absolute due date date of the loan
        uint256 dueDate;
        // installment loan specific

        // Remaining balance of the loan. Starts as equal to principal. Can reduce based on
        // payments made, can increased based on compounded interest from missed payments and late fees.
        uint256 balance;
        // Amount paid down of the loan. Balance + balance paid should always
        // be gte than principal + compounded interest (until present)
        uint256 balancePaid;
        // The total amount of late fees accrued to the loan
        uint256 lateFeesAccrued;
        // Number of consecutive missed payments
        uint256 numMissedPayments;
        // Number of installment payments made on the loan
        uint256 numInstallmentsPaid;
    }
}
