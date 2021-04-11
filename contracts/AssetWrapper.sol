// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "./interfaces/IAssetWrapper.sol";

/**
 * @dev {ERC721} token allows users to create bundles of assets.
 *
 * Users can create new bundles, which grants them an NFT to
 * reclaim all assets stored in the bundle. They can then
 * store various types of assets in that bundle. The bundle NFT
 * can then be used or traded as an asset in its own right.
 * At any time, the holder of the bundle NFT can redeem it for the
 * underlying assets.
 */
contract AssetWrapper is Context, ERC721Enumerable, ERC721Burnable, IAssetWrapper {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdTracker;

    struct ERC20Holding {
        address tokenAddress;
        uint256 amount;
    }
    mapping(uint256 => ERC20Holding[]) public bundleERC20Holdings;

    /**
     * @dev Initializes the token with name and symbol parameters
     */
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

    /**
     * @dev Creates a new bundle token for `to`. Its token ID will be
     * automatically assigned (and available on the emitted {IERC721-Transfer} event)
     *
     * See {ERC721-_mint}.
     */
    function initializeBundle(address to) external override {
        _mint(to, _tokenIdTracker.current());
        _tokenIdTracker.increment();
    }

    /**
     * @dev Deposit some ERC20 tokens into a given bundle
     *
     * Requirements:
     *
     * - The bundle with id `bundleId` must have been initialized with {initializeBundle}
     * - `amount` tokens from `msg.sender` on `tokenAddress` must have been approved to this contract
     */
    function depositERC20(
        address tokenAddress,
        uint256 amount,
        uint256 bundleId
    ) external override {
        TransferHelper.safeTransferFrom(tokenAddress, _msgSender(), address(this), amount);

        // Note: there can be multiple `ERC20Holding` objects for the same token contract
        // in a given bundle. We could deduplicate them here, though I don't think
        // it's worth the extra complexity - the end effect is the same in either case.
        bundleERC20Holdings[bundleId].push(ERC20Holding(tokenAddress, amount));
        emit DepositERC20(tokenAddress, amount, bundleId);
    }

    /**
     * @dev Withdraw all assets in the given bundle, returning them to the msg.sender
     *
     * Requirements:
     *
     * - The bundle with id `bundleId` must have been initialized with {initializeBundle}
     * - The bundle with id `bundleId` must be owned by or approved to msg.sender
     */
    function withdraw(uint256 bundleId) external override {
        require(_isApprovedOrOwner(_msgSender(), bundleId), "AssetWrapper: Non-owner withdrawal");
        burn(bundleId);

        ERC20Holding[] memory holdings = bundleERC20Holdings[bundleId];
        for (uint256 i = 0; i < holdings.length; i++) {
            TransferHelper.safeTransfer(holdings[i].tokenAddress, _msgSender(), holdings[i].amount);
        }
    }

    /**
     * @dev Hook that is called before any token transfer
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
