pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

interface IPromissoryNote is IERC721 {
    /* 
    @dev Emitted when an ERC20 token is deposited
    */
    event Repay(uint256 loanId, address lender);

    function mint(address to) external;

    function burn(uint256 loanId, uint256 tokenId) external;
}
