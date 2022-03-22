// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/* @title OwnableERC721
 * @notice Use ERC721 ownership for access control
 *  Requires tokenId scheme must map to map uint256(contract address)
 */
abstract contract OwnableERC721 {
    address public ownershipToken;

    modifier onlyOwner() {
        require(owner() == msg.sender, "OwnableERC721: caller is not the owner");
        _;
    }

    function _setNFT(address _ownershipToken) internal {
        ownershipToken = _ownershipToken;
    }

    function owner() public view virtual returns (address ownerAddress) {
        return IERC721(ownershipToken).ownerOf(uint256(uint160(address(this))));
    }
}
