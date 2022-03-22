// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @dev Interface for a vault owner to delegate call ability to another entity
 *   Useful in the case where a vault is being used as collateral for a loan
 *   and the borrower wants to claim an airdrop
 */
interface ICallDelegator {
    /**
     * @dev Return true if the caller is allowed to call functions on the given vault
     * @param caller The user that wants to call a function
     * @param vault The vault that the caller wants to call a function on
     * @return true if allowed, else false
     */
    function canCallOn(address caller, address vault) external view returns (bool);
}
