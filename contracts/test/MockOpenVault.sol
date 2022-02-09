pragma solidity ^0.8.0;

contract MockOpenVault {
    function withdrawEnabled() external pure returns (bool) {
        return false;
    }
}
