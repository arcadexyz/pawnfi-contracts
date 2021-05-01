pragma solidity ^0.8.0;

interface IBorrowerNote {
    /* 
    @dev Emitted when an ERC20 token is deposited
    */
    event Repay(uint256 loanId, address lender);

    function mint(
        uint256 account,
        uint256 loanId,
        address assetWrapper
    ) external;

    function burn(
        uint256 account,
        uint256 loadId,
        address assetWrapper
    ) external;

   
}
