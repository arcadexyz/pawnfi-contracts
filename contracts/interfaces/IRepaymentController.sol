// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IRepaymentController {
    /**
     * @dev used to repay a currently active loan.
     *
     * The loan must be in the Active state, and the
     * payableCurrency must be approved for withdrawal by the
     * repayment controller. This call will withdraw tokens
     * from the caller's wallet.
     *
     */
    function repay(uint256 borrowerNoteId) external;

    /**
     * @dev used to repay a currently active loan that is past due.
     *
     * The loan must be in the Active state, and the caller must
     * be the holder of the lender note.
     */
    function claim(uint256 lenderNoteId) external;
}
