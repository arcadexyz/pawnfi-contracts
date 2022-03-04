pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

interface IPromissoryNote is IERC721Enumerable {
    // Getter for mapping: mapping(uint256 => uint256) public loanIdByNoteId;
    function loanIdByNoteId(uint256 noteId) external view returns (uint256);

    function mint(address to, uint256 loanId) external returns (uint256);

    function burn(uint256 tokenId) external;
}
