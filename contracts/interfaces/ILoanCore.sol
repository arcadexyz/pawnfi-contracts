// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @dev Enum describing the current state of a loan
 * State change flow:
 *  Created -> Active -> Repaid
 *                    -> Defaulted
 */
enum LoanState {
    // Dummy enum value so all valid values are non-zero
    // this avoids an issue where an uninitialized loan has a valid state of Created
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
 * @dev The raw terms of a loan
 */
struct LoanTerms {
    // Timestamp representing the due date of the loan
    uint256 dueDate;
    // The amount of principal in terms of the payableCurrency
    uint256 principal;
    // The amount of interest in terms of the payableCurrency
    uint256 interest;
    // The tokenID of the collateral bundle
    uint256 collateralTokenId;
    // The payable currency for the loan principal and interest
    address payableCurrency;
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
}

/**
 * @dev Interface for the LoanCore contract
 */
interface ILoanCore {
    /**
     * @dev Emitted when a loan is initially created
     */
    event LoanCreated(LoanTerms terms, uint256 loanId);

    /**
     * @dev Emitted when a loan is started and principal is distributed to the borrower.
     */
    event LoanStarted(uint256 loanId, address lender, address borrower);

    /**
     * @dev Emitted when a loan is repaid by the borrower
     */
    event LoanRepaid(uint256 loanId);

    /**
     * @dev Emitted when a loan collateral is claimed by the lender
     */
    event LoanClaimed(uint256 loanId);

    /**
     * @dev Emitted when fees are claimed by admin
     */
    event FeesClaimed(address token, address to, uint256 amount);

    /**
     * @dev Get LoanData by loanId
     */
    function getLoan(uint256 loanId) external view returns (LoanData calldata loanData);

    /**
     * @dev Create store a loan object with some given terms
     */
    function createLoan(LoanTerms calldata terms) external returns (uint256 loanId);

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
    ) external;

    /**
     * @dev Repay the given loan
     *
     * Requirements:
     *  - The caller must be a holder of the borrowerNote
     *  - The caller must send in principal + interest
     *  - The loan must be in state Active
     */
    function repay(uint256 loanId) external;

    /**
     * @dev Claim the collateral of the given delinquent loan
     *
     * Requirements:
     *  - The caller must be a holder of the lenderNote
     *  - The loan must be in state Active
     *  - The current time must be beyond the dueDate
     */
    function claim(uint256 loanId) external;
}
