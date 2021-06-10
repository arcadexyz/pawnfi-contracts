pragma solidity ^0.8.0;

interface IFeeController {
    function setOriginationFee(uint256 _originationFee) external;

    function getOriginationFee() external view returns (uint256);
}
