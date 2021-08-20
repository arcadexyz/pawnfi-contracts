// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract MockERC20 is Context, ERC20Burnable {
    /**
     * @dev Initializes ERC20 token
     */
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    /**
     * @dev Creates `amount` new tokens for `to`. Public for any test to call.
     *
     * See {ERC20-_mint}.
     */
    function mint(address to, uint256 amount) public virtual {
        _mint(to, amount);
    }
}

contract MockERC20WithDecimals is ERC20PresetMinterPauser {
    uint8 private _decimals;

    /**
     * @dev Initializes ERC20 token
     */
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals
    ) ERC20PresetMinterPauser(name, symbol) {
        _decimals = decimals;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
