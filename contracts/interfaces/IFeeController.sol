pragma solidity ^0.8.0;

/**
 * @dev Interface for a FeeController contract
 */

enum FeeType { Origination, Repayment, LateFee }

interface IFeeController {
    /**
     * @dev Emitted when a Loan is created
     */

    function setOriginationFee() external returns (uint256);

    function getOriginationFee(uint256 amount) external returns (uint256);
}
