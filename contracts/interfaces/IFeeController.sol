pragma solidity ^0.8.0;

/**
 * @dev Interface for a FeeController contract
 */

interface FeeController {
    /**
     * @dev Emitted when a Loan is created
     */

    function getOriginationFee(uint256 amount) external returns (uint256);
}
