// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract MockERC1155 is Context, ERC1155 {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdTracker;

    /**
     * @dev Initializes ERC1155 token
     */
    constructor() ERC1155("") {}

    /**
     * @dev Creates `amount` tokens of token type `id`, and assigns them to `account`.
     *
     * Emits a {TransferSingle} event.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - If `account` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
     * acceptance magic value.
     */
    function mint(address to, uint256 amount) public virtual {
        _mint(to, _tokenIdTracker.current(), amount, "");
        _tokenIdTracker.increment();
    }
}
