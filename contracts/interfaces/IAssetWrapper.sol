// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @dev Interface for an AssetWrapper contract
 */
interface IAssetWrapper {
    /**
     * @dev Emitted when an ERC20 token is deposited
     */
    event DepositERC20(address indexed tokenAddress, uint256 indexed amount, uint256 indexed bundleId);

    function initializeBundle(address to) external;

    function depositERC20(
        address tokenAddress,
        uint256 amount,
        uint256 bundleId
    ) external;

    function withdraw(uint256 bundleId) external;
}
