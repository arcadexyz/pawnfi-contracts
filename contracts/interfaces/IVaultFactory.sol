// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @dev Interface for a vault factory contract
 */
interface IVaultFactory {
    /**
     * @dev Emitted when a new vault is created
     */
    event VaultCreated(address vault, address to);

    /**
     * @dev Return true if the given address is a vault instance created by this factory, else false
     * @param instance The address to check
     */
    function isInstance(address instance) external view returns (bool validity);

    /**
     * @dev Return the number of instances created by this factory
     */
    function instanceCount() external view returns (uint256);

    /**
     * @dev Return the instance at the given index
     * @dev allows for enumeration over all instances
     * @param index the index to return instance at
     */
    function instanceAt(uint256 index) external view returns (address);

    /**
     * @dev Creates a new asset vault bundle, returning the bundle tokenId
     * @dev note that the vault tokenId is a uint256 cast of the vault address
     * @param to The recipient of the newly created bundle
     */
    function initializeBundle(address to) external returns (uint256);
}
