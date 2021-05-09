// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract MockERC721 is ERC721 {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdTracker;

    /**
     * @dev Initializes ERC20 token
     */
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

    /**
     * @dev Creates a new token for `to`. Public for any test to call.
     *
     * See {ERC721-_mint}.
     */
    function mint(address to) external returns (uint256 tokenId) {
        tokenId = _tokenIdTracker.current();
        _mint(to, tokenId);
        _tokenIdTracker.increment();
    }

    /**
     * @dev Burn the given token, can be called by anyone
     */
    function burn(uint256 tokenId) external {
        _burn(tokenId);
    }
}