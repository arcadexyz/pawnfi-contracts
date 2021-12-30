// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../libraries/LoanLibrary.sol";

/**
 * @dev Interface for the OriginationController contracts
 */
interface IOriginationController {
    /**
     * @dev initializes loan from loan core
     * Requirements:
     * - The caller must be a borrower or lender
     * - The external signer must not be msg.sender
     * - The external signer must be a borrower or lender
     * @param loanTerms - struct containing specifics of loan made between lender and borrower
     * @param borrower - address of borrowerPromissory note
     * @param lender - address of lenderPromissory note
     * @param v, r, s - signature from erc20
     */
    function initializeLoan(
        LoanLibrary.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 loanId);

    /**
     * @dev creates a new loan, with permit attached
     * @param loanTerms - struct containing specifics of loan made between lender and borrower
     * @param borrower - address of borrowerPromissory note
     * @param lender - address of lenderPromissory note
     * @param v, r, s - signature from erc20
     * @param collateralV, collateralR, collateralS - signature from collateral
     * @param permitDeadline - timestamp at which the collateral signature becomes invalid
     */
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
    ) external returns (uint256 loanId);
}
