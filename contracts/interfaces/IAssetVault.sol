// SPDX-License-Identifier: MIT
import "./ICallWhitelist.sol";

pragma solidity ^0.8.0;

/**
 * @dev Interface for an AssetVault contract
 */
interface IAssetVault {
    /**
     * @dev Emitted when withdraws are enabled on the vault
     */
    event WithdrawEnabled(address operator);

    /**
     * @dev Emitted when an ERC20 token is withdrawn
     */
    event WithdrawERC20(address indexed operator, address indexed token, address recipient, uint256 amount);

    /**
     * @dev Emitted when an ERC721 token is withdrawn
     */
    event WithdrawERC721(address indexed operator, address indexed token, address recipient, uint256 tokenId);

    /**
     * @dev Emitted when an ERC1155 token is withdrawn
     */
    event WithdrawERC1155(
        address indexed operator,
        address indexed token,
        address recipient,
        uint256 tokenId,
        uint256 amount
    );

    /**
     * @dev Emitted when ETH is withdrawn
     */
    event WithdrawETH(address indexed operator, address indexed recipient, uint256 amount);

    /**
     * @dev Emitted when an external call is made from the vault
     */
    event Call(address indexed operator, address indexed to, bytes data);

    /**
     * @dev Sets up the vault
     * @param _whitelist The whitelist contract which decides what external calls are valid
     */
    function initialize(address _whitelist) external;

    /**
     * @dev Return true if withdrawing is enabled on the vault
     * @dev if false, the vault can only receive deposits, else it can also withdraw
     * @dev Any integration should be aware that a vault with withdraw enabled is not safe to use as collateral
     *  as the held assets may be withdrawn without notice, i.e. to frontrun a deposit
     */
    function withdrawEnabled() external view returns (bool);

    /**
     * @dev Return the contract being used to whitelist function calls
     */
    function whitelist() external view returns (ICallWhitelist);

    /**
     * @dev Enables withdrawals on the vault
     * @dev Any integration should be aware that a withdraw-enabled vault is not safe to use as collateral
     *  as the held assets may be withdrawn without notice, i.e. to frontrun a deposit
     *
     *
     * Requirements:
     *
     * - Caller must be the owner of the tracking NFT
     */
    function enableWithdraw() external;

    /**
     * @dev Withdraw entire balance of a given ERC20 token from the vault
     * @param token The ERC20 token to withdraw
     * @param to the recipient of the withdrawn funds
     *
     * Requirements:
     *
     * - The vault must be in closed state
     * - The caller must be the owner
     */
    function withdrawERC20(address token, address to) external;

    /**
     * @dev Withdraw an ERC721 token from the vault
     * @param token The token to withdraw
     * @param tokenId The id of the NFT to withdraw
     * @param to The recipient of the withdrawn token
     *
     * Requirements:
     *
     * - The vault must be in closed state
     * - The caller must be the owner
     * - token must exist and be owned by this contract
     */
    function withdrawERC721(
        address token,
        uint256 tokenId,
        address to
    ) external;

    /**
     * @dev Withdraw entire balance of an ERC1155 token from the vault
     * @param token The token to withdraw
     * @param tokenId The id of the token to withdraw
     * @param to The recipient of the withdrawn token
     *
     * Requirements:
     *
     * - The vault must be in closed state
     * - The caller must be the owner
     */
    function withdrawERC1155(
        address token,
        uint256 tokenId,
        address to
    ) external;

    /**
     * @dev Withdraw entire balance of ETH from the vault
     *
     * Requirements:
     *
     * - The vault must be in closed state
     * - The caller must be the owner
     */
    function withdrawETH(address to) external;

    /**
     * @dev Call a function on an external contract
     * @dev This is intended for claiming airdrops while the vault is being used as collateral
     * @param to The contract address to call
     * @param data The data to call the contract with
     *
     * Requirements:
     *
     * - The vault must be in closed state
     * - The caller must either be the owner, or the owner must have explicitly
     *  delegated this ability to the caller through ICallDelegator interface
     * - The call must be in the whitelist
     */
    function call(address to, bytes memory data) external;
}
