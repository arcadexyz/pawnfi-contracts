// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";


/**
 * @dev Interface for a receiver of flash borrow operations from
 *      an EscrowVault contract. Any contract that plans to borrow
 *      from an EscrowVault (i.e., an airdrop adapter) must implement this.
 */
interface IFlashBorrowReceiver {
    function executeERC20Borrow(
        address initiator,
        IERC20 token,
        uint256 amount,
        bytes calldata params
    ) external returns (bool);

    function executeERC721Borrow(
        address initiator,
        IERC721 asset,
        uint256 tokenId,
        bytes calldata params
    ) external returns (bool);

    function executeERC1155Borrow(
        address initiator,
        IERC1155 asset,
        uint256 tokenId,
        uint256 amount,
        bytes calldata params
    ) external returns (bool);
}