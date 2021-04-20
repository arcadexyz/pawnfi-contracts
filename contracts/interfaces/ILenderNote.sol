// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @dev Interface for an AssetWrapper contract
 */
interface ILenderNote {
    /**
     * @dev Emitted when an ERC20 token is deposited
     */

    event Collect(uint256 loanId, address indexed lender);

    function collect(uint256 noteId) external;

    function mint(uint256 account, address assetWrapper) external;
}
