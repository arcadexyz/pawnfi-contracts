pragma solidity ^0.8.0;

enum FeeType { Origination, Repayment, LateFee }

interface IFeeController {
    function setOriginationFee() external returns (uint256);

    function getOriginationFee(uint256 amount) external returns (uint256);
}
