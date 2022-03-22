// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../interfaces/ICallWhitelist.sol";
import "../interfaces/ICallDelegator.sol";
import "../interfaces/IAssetVault.sol";
import "./OwnableERC721.sol";

/// @title AssetVault
/// @notice Vault for isolated storage of collateral tokens
/// @dev Note this is a one-time use vault.
///  It starts in a deposit-only state. Funds cannot be withdrawn at this point
///  When the owner calls "enableWithdraw()", the state is set to a withdrawEnabled state
///  Withdraws cannot be disabled once enabled
///  This restriction protects integrations and purchasers of AssetVaults from unexpected withdrawal
///  I.e. Someone buys an AV assuming it contains token X, but I withdraw token X right before the sale concludes
/// @dev note that there is an arbitrary external call which can be made by either:
///     - the current owner of the vault
///     - someone who the current owner "delegates" through the ICallDelegator interface
///  This is to enable airdrop claims by borrowers during loans.
contract AssetVault is IAssetVault, OwnableERC721, Initializable, ERC1155Holder, ERC721Holder, ReentrancyGuard {
    using Address for address;
    using Address for address payable;
    using SafeERC20 for IERC20;

    // True if withdrawals are allowed out of this vault
    // Note once set to true, it cannot be reverted back to false
    bool public override withdrawEnabled;

    // Whitelist contract to determine if a given external call is allowed
    ICallWhitelist public override whitelist;

    modifier onlyWithdrawEnabled() {
        require(withdrawEnabled, "AssetVault: withdraws disabled");
        _;
    }

    modifier onlyWithdrawDisabled() {
        require(!withdrawEnabled, "AssetVault: withdraws enabled");
        _;
    }

    /**
     * @dev initialize values so initialize cannot be called on template
     */
    constructor() {
        withdrawEnabled = true;
        OwnableERC721._setNFT(msg.sender);
    }

    /**
     * @dev Function to initialize the contract
     */
    function initialize(address _whitelist) external override initializer {
        require(!withdrawEnabled && ownershipToken == address(0), "AssetVault: Already initialized");
        // set ownership to inherit from the factory who deployed us
        // The factory should have a tokenId == uint256(address(this))
        // whose owner has ownership control over this contract
        OwnableERC721._setNFT(msg.sender);
        whitelist = ICallWhitelist(_whitelist);
    }

    receive() external payable {}

    /**
     * @inheritdoc OwnableERC721
     */
    function owner() public view override returns (address ownerAddress) {
        return OwnableERC721.owner();
    }

    /**
     * @inheritdoc IAssetVault
     */
    function enableWithdraw() external override onlyOwner onlyWithdrawDisabled {
        withdrawEnabled = true;
        emit WithdrawEnabled(msg.sender);
    }

    /** Withdrawal functions */

    /**
     * @inheritdoc IAssetVault
     */
    function withdrawERC20(address token, address to) external override onlyOwner onlyWithdrawEnabled {
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, balance);
        emit WithdrawERC20(msg.sender, token, to, balance);
    }

    /**
     * @inheritdoc IAssetVault
     */
    function withdrawERC721(
        address token,
        uint256 tokenId,
        address to
    ) external override onlyOwner onlyWithdrawEnabled {
        IERC721(token).safeTransferFrom(address(this), to, tokenId);
        emit WithdrawERC721(msg.sender, token, to, tokenId);
    }

    /**
     * @inheritdoc IAssetVault
     */
    function withdrawERC1155(
        address token,
        uint256 tokenId,
        address to
    ) external override onlyOwner onlyWithdrawEnabled {
        uint256 balance = IERC1155(token).balanceOf(address(this), tokenId);
        IERC1155(token).safeTransferFrom(address(this), to, tokenId, balance, "");
        emit WithdrawERC1155(msg.sender, token, to, tokenId, balance);
    }

    /**
     * @inheritdoc IAssetVault
     */
    function withdrawETH(address to) external override onlyOwner onlyWithdrawEnabled nonReentrant {
        // perform transfer
        uint256 balance = address(this).balance;
        payable(to).sendValue(balance);
        emit WithdrawETH(msg.sender, to, balance);
    }

    /**
     * @inheritdoc IAssetVault
     */
    function call(address to, bytes calldata data) external override onlyWithdrawDisabled nonReentrant {
        require(
            msg.sender == owner() || ICallDelegator(owner()).canCallOn(msg.sender, address(this)),
            "AssetVault: call disallowed"
        );
        require(whitelist.isWhitelisted(to, bytes4(data[:4])), "AssetVault: non-whitelisted call");

        to.functionCall(data);
        emit Call(msg.sender, to, data);
    }
}
