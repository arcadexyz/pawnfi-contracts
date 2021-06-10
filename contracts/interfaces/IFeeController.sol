pragma solidity ^0.8.0;

interface IFeeController {
    function setOriginationFee() external onlyOwner;

    function getOriginationFee() external view returns (uint256);
}
