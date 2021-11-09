// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/IFlashRollover.sol";

/* solhint-disable no-unused-vars */
contract MockAddressesProvider {
    address public lendingPool;

    constructor(address _lendingPool) {
        lendingPool = _lendingPool;
    }

    function getLendingPool() external view returns (address) {
        return lendingPool;
    }
}

contract MockLendingPool {
    uint256 private loanFeeBps = 9;

    event FlashLoan(uint256 amount, uint256 fee);

    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata modes,
        address onBehalfOf,
        bytes calldata params,
        uint16 referralCode
    ) external {
        uint256 startBalance = IERC20(assets[0]).balanceOf(address(this));
        uint256 premium = (amounts[0] * loanFeeBps) / 10_000;
        uint256[] memory premiums = new uint256[](1);
        premiums[0] = premium;

        // Send assets - only supports one asset
        IERC20(assets[0]).transfer(receiverAddress, amounts[0]);

        // Call the callback operation
        IFlashLoanReceiver(receiverAddress).executeOperation(assets, amounts, premiums, msg.sender, params);

        emit FlashLoan(amounts[0], premium);
        // Require repayment plus premium
        require(
            IERC20(assets[0]).transferFrom(receiverAddress, address(this), amounts[0] + premiums[0]),
            "Failed repayment"
        );
    }
}
