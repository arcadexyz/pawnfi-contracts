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

    event SetOwner(address owner);

    /**
     * The contract references needed to roll
     * over the loan. Other dependent contracts
     * (asset wrapper, promissory notes) can
     * be fetched from the relevant LoanCore
     * contracts.
     */
    struct RolloverContractParams {
        ILoanCore sourceLoanCore;
        ILoanCore targetLoanCore;
        IRepaymentController sourceRepaymentController;
        IOriginationController targetOriginationController;
    }

    /**
     * Holds parameters passed through flash loan
     * control flow that dictate terms of the new loan.
     * Contains a signature by lender for same terms.
     * isLegacy determines which loanCore to look for the
     * old loan in.
     */
    struct OperationData {
        RolloverContractParams contracts;
        uint256 loanId;
        LoanLibrary.LoanTerms newLoanTerms;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /**
     * Defines the contracts that should be used for a
     * flash loan operation. May change based on if the
     * old loan is on the current loanCore or legacy (in
     * which case it requires migration).
     */
    struct OperationContracts {
        ILoanCore loanCore;
        IERC721 borrowerNote;
        IERC721 lenderNote;
        IFeeController feeController;
        IERC721 assetWrapper;
        IRepaymentController repaymentController;
        IOriginationController originationController;
        ILoanCore targetLoanCore;
        IERC721 targetBorrowerNote;
    }

    function rolloverLoan(
        RolloverContractParams calldata contracts,
        uint256 loanId,
        LoanLibrary.LoanTerms calldata newLoanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function setOwner(address _owner) external;

    function flushToken(IERC20 token, address to) external;
}
