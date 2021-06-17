// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IAssetWrapper.sol";
import "./ERC721Permit.sol";

/**
 * @dev {ERC721} token allowing users to create bundles of assets.
 *
 * Users can create new bundles, which grants them an NFT to
 * reclaim all assets stored in the bundle. They can then
 * store various types of assets in that bundle. The bundle NFT
 * can then be used or traded as an asset in its own right.
 * At any time, the holder of the bundle NFT can redeem it for the
 * underlying assets.
 */
contract AssetWrapper is
    Context,
    ERC721Enumerable,
    ERC721Burnable,
    ERC1155Holder,
    ERC721Holder,
    ERC721Permit,
    IAssetWrapper
{
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    Counters.Counter private _tokenIdTracker;

    struct ERC20Holding {
        address tokenAddress;
        uint256 amount;
    }
    mapping(uint256 => ERC20Holding[]) public bundleERC20Holdings;

    struct ERC721Holding {
        address tokenAddress;
        uint256 tokenId;
    }
    mapping(uint256 => ERC721Holding[]) public bundleERC721Holdings;

    struct ERC1155Holding {
        address tokenAddress;
        uint256 tokenId;
        uint256 amount;
    }
    mapping(uint256 => ERC1155Holding[]) public bundleERC1155Holdings;

    mapping(uint256 => uint256) public bundleETHHoldings;

    /**
     * @dev Initializes the token with name and symbol parameters
     */
    constructor(string memory name, string memory symbol) ERC721(name, symbol) ERC721Permit(name) {}

    /**
     * @inheritdoc IAssetWrapper
     */
    function initializeBundle(address to) external override {
        _mint(to, _tokenIdTracker.current());
        _tokenIdTracker.increment();
    }

    /**
     * @inheritdoc IAssetWrapper
     */
    function depositERC20(
        address tokenAddress,
        uint256 amount,
        uint256 bundleId
    ) external override {
        require(_exists(bundleId), "Bundle does not exist");

        SafeERC20.safeTransferFrom(IERC20(tokenAddress), _msgSender(), address(this), amount);

        // Note: there can be multiple `ERC20Holding` objects for the same token contract
        // in a given bundle. We could deduplicate them here, though I don't think
        // it's worth the extra complexity - the end effect is the same in either case.
        bundleERC20Holdings[bundleId].push(ERC20Holding(tokenAddress, amount));
        emit DepositERC20(_msgSender(), bundleId, tokenAddress, amount);
    }

    /**
     * @inheritdoc IAssetWrapper
     */
    function depositERC721(
        address tokenAddress,
        uint256 tokenId,
        uint256 bundleId
    ) external override {
        require(_exists(bundleId), "Bundle does not exist");

        IERC721(tokenAddress).transferFrom(_msgSender(), address(this), tokenId);

        bundleERC721Holdings[bundleId].push(ERC721Holding(tokenAddress, tokenId));
        emit DepositERC721(_msgSender(), bundleId, tokenAddress, tokenId);
    }

    /**
     * @inheritdoc IAssetWrapper
     */
    function depositERC1155(
        address tokenAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 bundleId
    ) external override {
        require(_exists(bundleId), "Bundle does not exist");

        IERC1155(tokenAddress).safeTransferFrom(_msgSender(), address(this), tokenId, amount, "");

        bundleERC1155Holdings[bundleId].push(ERC1155Holding(tokenAddress, tokenId, amount));
        emit DepositERC1155(_msgSender(), bundleId, tokenAddress, tokenId, amount);
    }

    /**
     * @inheritdoc IAssetWrapper
     */
    function depositETH(uint256 bundleId) external payable override {
        require(_exists(bundleId), "Bundle does not exist");

        uint256 amount = msg.value;

        bundleETHHoldings[bundleId] = bundleETHHoldings[bundleId].add(amount);
        emit DepositETH(_msgSender(), bundleId, amount);
    }

    /**
     * @inheritdoc IAssetWrapper
     */
    function withdraw(uint256 bundleId) external override {
        require(_isApprovedOrOwner(_msgSender(), bundleId), "AssetWrapper: Non-owner withdrawal");
        burn(bundleId);

        ERC20Holding[] memory erc20Holdings = bundleERC20Holdings[bundleId];
        for (uint256 i = 0; i < erc20Holdings.length; i++) {
            SafeERC20.safeTransfer(IERC20(erc20Holdings[i].tokenAddress), _msgSender(), erc20Holdings[i].amount);
        }
        delete bundleERC20Holdings[bundleId];

        ERC721Holding[] memory erc721Holdings = bundleERC721Holdings[bundleId];
        for (uint256 i = 0; i < erc721Holdings.length; i++) {
            IERC721(erc721Holdings[i].tokenAddress).safeTransferFrom(
                address(this),
                _msgSender(),
                erc721Holdings[i].tokenId
            );
        }
        delete bundleERC721Holdings[bundleId];

        ERC1155Holding[] memory erc1155Holdings = bundleERC1155Holdings[bundleId];
        for (uint256 i = 0; i < erc1155Holdings.length; i++) {
            IERC1155(erc1155Holdings[i].tokenAddress).safeTransferFrom(
                address(this),
                _msgSender(),
                erc1155Holdings[i].tokenId,
                erc1155Holdings[i].amount,
                ""
            );
        }
        delete bundleERC1155Holdings[bundleId];

        uint256 ethHoldings = bundleETHHoldings[bundleId];
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = _msgSender().call{ value: ethHoldings }("");
        require(success, "Failed to withdraw ETH");
        delete bundleETHHoldings[bundleId];

        emit Withdraw(_msgSender(), bundleId);
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
        override(ERC721, ERC721Enumerable, ERC1155Receiver)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
