// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @dev Interface for a call whitelist contract which
 * whitelists certain functions on certain contracts to call
 */
interface ICallWhitelist {
    /**
     * @dev Emitted when a new call is whitelisted
     */
    event CallAdded(address operator, address callee, bytes4 selector);

    /**
     * @dev Emitted when a call is removed from the whitelist
     */
    event CallRemoved(address operator, address callee, bytes4 selector);

    /**
     * @dev Return true if the given function on the given callee is whitelisted
     * @param callee The contract that is intended to be called
     * @param selector The function selector that is intended to be called
     * @return true if whitelisted, else false
     */
    function isWhitelisted(address callee, bytes4 selector) external view returns (bool);

    /**
     * @dev Add the given callee and selector to the whitelist
     * @param callee The contract to whitelist
     * @param selector The function selector to whitelist
     */
    function add(address callee, bytes4 selector) external;

    /**
     * @dev Remove the given callee and selector from the whitelist
     * @param callee The contract to whitelist
     * @param selector The function selector to whitelist
     */
    function remove(address callee, bytes4 selector) external;
}
