// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./interfaces/IFlashBorrowReceiver.sol";
import "./AssetWrapper.sol";

error CLAIM_NoWithdrawableERC20Balance(address token);
error CLAIM_NotERC721Owner(address asset, uint256 tokenId);
error CLAIM_ERC721NotWithdrawable(address asset, uint256 tokenId);
error CLAIM_NoWithdrawableERC1155Balance(address asset, uint256 tokenId);
error CLAIM_NoWithdrawableETHBalance();
error FLASH_ExecuteFailure(address target);

contract EscrowVault is AssetWrapper, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Total balances tracked across all bundles. Used to identify unbundled holdings.
    uint256 ethBalance;
    mapping(address => uint256) erc20Balances;
    mapping(address => mapping(uint256 => bool)) erc721Balances;
    mapping(address => mapping(uint256 => uint256)) erc1155Balances;

    /**
     * @notice Initializes a vault with a specific owner.
     */
    constructor(
        address _owner,
        string memory name,
        string memory symbol
    ) AssetWrapper(name, symbol) {
        transferOwnership(_owner);
    }

    // TODO: Update deposit/withdraw functions to do global balance accounting
    function depositERC20(
        address tokenAddress,
        uint256 amount,
        uint256 bundleId
    ) public override {
        super.depositERC20(tokenAddress, amount, bundleId);

        erc20Balances[tokenAddress] += amount;
    }

    function depositERC721(
        address tokenAddress,
        uint256 tokenId,
        uint256 bundleId
    ) public override {
        super.depositERC721(tokenAddress, tokenId, bundleId);

        erc721Balances[tokenAddress][tokenId] = true;
    }

    function depositERC1155(
        address tokenAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 bundleId
    ) public override {
        super.depositERC1155(tokenAddress, tokenId, amount, bundleId);

        erc1155Balances[tokenAddress][tokenId] += amount;
    }

    function depositETH(uint256 bundleId) public payable override {
        super.depositETH(bundleId);

        ethBalance += msg.value;
    }

    function withdraw(uint256 bundleId) external override {
        require(_isApprovedOrOwner(_msgSender(), bundleId), "AssetWrapper: Non-owner withdrawal");
        burn(bundleId);

        ERC20Holding[] memory erc20Holdings = bundleERC20Holdings[bundleId];
        for (uint256 i = 0; i < erc20Holdings.length; i++) {
            ERC20Holding memory h = erc20Holdings[i];
            IERC20(h.tokenAddress).safeTransfer(_msgSender(), h.amount);
            erc20Balances[h.tokenAddress] -= h.amount;
        }
        delete bundleERC20Holdings[bundleId];

        ERC721Holding[] memory erc721Holdings = bundleERC721Holdings[bundleId];
        for (uint256 i = 0; i < erc721Holdings.length; i++) {
            ERC721Holding memory h = erc721Holdings[i];
            IERC721(h.tokenAddress).safeTransferFrom(
                address(this),
                _msgSender(),
                h.tokenId
            );
            erc721Balances[h.tokenAddress][h.tokenId] = false;
        }
        delete bundleERC721Holdings[bundleId];

        ERC1155Holding[] memory erc1155Holdings = bundleERC1155Holdings[bundleId];
        for (uint256 i = 0; i < erc1155Holdings.length; i++) {
            ERC1155Holding memory h = erc1155Holdings[i];
            IERC1155(h.tokenAddress).safeTransferFrom(
                address(this),
                _msgSender(),
                h.tokenId,
                h.amount,
                ""
            );
            erc1155Balances[h.tokenAddress][h.tokenId] -= h.amount;

        }
        delete bundleERC1155Holdings[bundleId];

        uint256 ethHoldings = bundleETHHoldings[bundleId];
        ethBalance -= ethHoldings;
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = _msgSender().call{ value: ethHoldings }("");
        require(success, "Failed to withdraw ETH");
        delete bundleETHHoldings[bundleId];

        emit Withdraw(_msgSender(), bundleId);
    }

    /**
     * @notice Claim an ERC20 held by the vault contract. Must not belong to a bundle.
     *         Used for any airdrops sent directly to contract.
     */
    function claimERC20(IERC20 token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        uint256 bundledBalance = erc20Balances[address(token)];

        uint256 wBalance = bundledBalance - balance;
        if (wBalance == 0) revert CLAIM_NoWithdrawableERC20Balance(address(token));

        token.safeTransfer(msg.sender, wBalance);
    }

    /**
     * @notice Claim an ERC721 held by the vault contract. Must not belong to a bundle.
     *         Used for any airdrops sent directly to contract.
     */
    function claimERC721(IERC721 asset, uint256 tokenId) external onlyOwner {
        if (asset.ownerOf(tokenId) != address(this)) revert CLAIM_NotERC721Owner(address(asset), tokenId);
        if (erc721Balances[address(asset)][tokenId] == true) revert CLAIM_ERC721NotWithdrawable(address(asset), tokenId);

        asset.safeTransferFrom(address(this), msg.sender, tokenId);
    }

    /**
     * @notice Claim an ERC1155 held by the vault contract. Must not belong to a bundle.
     *         Used for any airdrops sent directly to contract.
     */
    function claimERC1155(IERC1155 asset, uint256 tokenId) external onlyOwner {
        uint256 balance = asset.balanceOf(address(this), tokenId);
        uint256 bundledBalance = erc1155Balances[address(asset)][tokenId];

        uint256 wBalance = bundledBalance - balance;
        if (wBalance == 0) revert CLAIM_NoWithdrawableERC1155Balance(address(asset), tokenId);

        asset.safeTransferFrom(address(this), msg.sender, tokenId, wBalance, "");
    }

    function claimETH() external onlyOwner {
        uint256 balance = address(this).balance;
        uint256 wBalance = ethBalance - balance;

        if (wBalance == 0) revert CLAIM_NoWithdrawableETHBalance();
    }

    /// TODO: Add flash borrow functions
    function flashBorrowERC20(
        address target,
        IERC20 token,
        uint256 amount,
        bytes calldata params
    ) external onlyOwner nonReentrant {
        // Transfer erc20
        token.safeTransfer(target, amount);

        // Call execute
        bool success = IFlashBorrowReceiver(target).executeERC20Borrow(
            msg.sender,
            token,
            amount,
            params
        );

        if (!success) revert FLASH_ExecuteFailure(target);

        // Take erc20 back
        token.safeTransferFrom(target, address(this), amount);
    }

    function flashBorrowERC721(
        address target,
        IERC721 asset,
        uint256 tokenId,
        bytes calldata params
    ) external onlyOwner nonReentrant {
        // Transfer erc721
        asset.safeTransferFrom(address(this), target, tokenId);

        // Call execute
        bool success = IFlashBorrowReceiver(target).executeERC721Borrow(
            msg.sender,
            asset,
            tokenId,
            params
        );

        if (!success) revert FLASH_ExecuteFailure(target);

        // Take erc721 back
        asset.safeTransferFrom(target, address(this), tokenId);
    }

    function flashBorrowERC1155(
        address target,
        IERC1155 asset,
        uint256 tokenId,
        uint256 amount,
        bytes calldata params
    ) external onlyOwner nonReentrant {
        // Transfer erc1155
        asset.safeTransferFrom(address(this), target, tokenId, amount, "");

        // Call execute
        bool success = IFlashBorrowReceiver(target).executeERC1155Borrow(
            msg.sender,
            asset,
            tokenId,
            amount,
            params
        );

        if (!success) revert FLASH_ExecuteFailure(target);

        // Take erc1155 back
        asset.safeTransferFrom(target, address(this), tokenId, amount, "");
    }
}