// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library LoanMetadata {

    // TODO: Do we want a different status for 'repaid late'?
    enum Status {
        OPEN,                       // Loan has been agreed upon or opened, not repaid or in default
        REPAID,                     // Loan has been fully repaid (either before or after due_date)
        DEFAULT,                    // Loan is past the due date and now in default (updated lazily)
        CLAIMED                     // Loan was in default and collateral claimed by lender
    }

    struct Terms {
        uint256 dueDate;            // Timestamp of when the loan becomes in default if not repaid
        uint256 amountPayable;      // Amount of funding currency to repay
        address payableCurrency;    // Type of funding currency to repay (0xEEEE.... if ETH)
        uint24 protocolFee;         // Fee levied by the protocol in basis points (e.g. 100 for a 1% fee)
        address collateral;         // Address pointing to AssetWrapper holding the collateral
    }

    struct Loan {
        Status status;              // Current status in loan lifecycle
        Terms terms;                // Financial terms of the loan (see 'Terms')
        address lenderNote;         // Contract holding the LenderNote interface used
        uint256 lenderNoteId;       // tokenId of the note for this loan tracked by LenderNote
        address borrowerNote;       // Contract holding the BorrowerNote interface used
        uint256 borrowerNoteId;     // tokenId of the note for this loan tracked by BorrowerNote
    }
}