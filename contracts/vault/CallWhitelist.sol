// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ICallWhitelist.sol";

/**
 * @title CallWhitelist
 * @notice Whitelist for calls that can be made from a vault
 * @dev This is intended to allow for "claim" functions to be called
 *  while vault is being held in escrow as collateral.
 * @dev Note this contract has admin permissions, which grant the admin
 *  the ability to add and remove contracts and functions from the whitelist
 */
contract CallWhitelist is Ownable, ICallWhitelist {
    // add some function selectors to the global blacklist
    // as-in clearly we shouldn't be able to just raw transfer assets out of the vault
    // without going through the normal process
    bytes4 private constant ERC20_TRANSFER = 0xa9059cbb;
    bytes4 private constant ERC20_ERC721_APPROVE = 0x095ea7b3;
    bytes4 private constant ERC20_ERC721_TRANSFER_FROM = 0x23b872dd;

    bytes4 private constant ERC721_SAFE_TRANSFER_FROM = 0x42842e0e;
    bytes4 private constant ERC721_SAFE_TRANSFER_FROM_DATA = 0xb88d4fde;
    bytes4 private constant ERC721_ERC1155_SET_APPROVAL = 0xa22cb465;

    bytes4 private constant ERC1155_SAFE_TRANSFER_FROM = 0xf242432a;
    bytes4 private constant ERC1155_SAFE_BATCH_TRANSFER_FROM = 0x2eb2c2d6;

    /**
     * @notice whitelist of callable functions on contracts
     *  Maps address that can be called to function selectors which can be called on it
     *  I.e. if we want to call 0x0000 on contract at 0x1111, mapping will have
     *  whitelist[0x1111][0x0000] = true
     */
    mapping(address => mapping(bytes4 => bool)) private whitelist;

    /**
     * @inheritdoc ICallWhitelist
     */
    function isWhitelisted(address callee, bytes4 selector) external view override returns (bool) {
        return !isBlacklisted(selector) && whitelist[callee][selector];
    }

    /**
     * @inheritdoc ICallWhitelist
     */
    function add(address callee, bytes4 selector) external override onlyOwner {
        whitelist[callee][selector] = true;
        emit CallAdded(msg.sender, callee, selector);
    }

    /**
     * @inheritdoc ICallWhitelist
     */
    function remove(address callee, bytes4 selector) external override onlyOwner {
        whitelist[callee][selector] = false;
        emit CallRemoved(msg.sender, callee, selector);
    }

    /**
     * Returns true if the given function selector is on the global blacklist, else false
     * @param selector the selector to check
     * @return true if blacklisted, else false
     */
    function isBlacklisted(bytes4 selector) internal pure returns (bool) {
        return
            selector == ERC20_TRANSFER ||
            selector == ERC20_ERC721_APPROVE ||
            selector == ERC20_ERC721_TRANSFER_FROM ||
            selector == ERC721_SAFE_TRANSFER_FROM ||
            selector == ERC721_SAFE_TRANSFER_FROM_DATA ||
            selector == ERC721_ERC1155_SET_APPROVAL ||
            selector == ERC1155_SAFE_TRANSFER_FROM ||
            selector == ERC1155_SAFE_BATCH_TRANSFER_FROM;
    }
}
