// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../external/interfaces/ILendingPool.sol";
import "./ILoanCore.sol";
import "./IOriginationController.sol";
import "./IRepaymentController.sol";

interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);

    // Function names defined by AAVE
    /* solhint-disable func-name-mixedcase */
    function ADDRESSES_PROVIDER() external view returns (ILendingPoolAddressesProvider);

    function LENDING_POOL() external view returns (ILendingPool);
    /* solhint-enable func-name-mixedcase */
}

interface IFlashRollover is IFlashLoanReceiver {
    event Rollover(address indexed lender, address indexed borrower, uint256 collateralTokenId, uint256 newLoanId);

    event Migration(address indexed oldLoanCore, address indexed newLoanCore, uint256 newLoanId);

    struct RolloverContractParams {
        ILoanCore loanCore;
        ILoanCore targetLoanCore;
        IRepaymentController repaymentController;
        IOriginationController originationController;
    }

    function rolloverLoan(
        RolloverContractParams calldata contracts,
        uint256 loanId,
        LoanLibrary.LoanTerms calldata newLoanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
