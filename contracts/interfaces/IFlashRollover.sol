// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./ILoanCore.sol";

interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

interface IFlashRollover is IFlashLoanReceiver {
    function rolloverLoan(
        bool isLegacy,
        uint256 loanId,
        LoanLibrary.LoanTerms calldata newLoanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
