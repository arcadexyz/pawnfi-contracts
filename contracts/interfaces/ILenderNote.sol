// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @dev Interface for the LenderNote contracts
 */
interface ILenderNote {
    /**
     * @dev Emitted when an ERC20 token is deposited
     */

    event Collect(uint256 loanId, address indexed lender);

    function mint(address to) external;

    function burn(uint256 tokenId) external;

    function pause() external;

    function unpause() external;

    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
