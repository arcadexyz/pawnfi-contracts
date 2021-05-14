// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface INote is IERC721 {
    function mint(address to) external returns (uint256 tokenId);

    function burn(uint256 tokenId) external;
}
