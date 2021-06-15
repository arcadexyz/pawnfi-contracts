// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../libraries/LoanData.sol";

/**
 * @dev Interface for the OriginationController contracts
 */
interface IOriginationController {
    /**
     * @dev creates a new loan
     *
     */
    function initializeLoan(
        LoanData.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev creates a new loan, with permit attached
     *
     *
     */
    function initializeLoanWithCollateralPermit(
        LoanData.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint8 collateralV,
        bytes32 collateralR,
        bytes32 collateralS
    ) external;
}
