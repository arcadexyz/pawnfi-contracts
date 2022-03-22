// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../interfaces/IAssetVault.sol";
import "../interfaces/IVaultFactory.sol";
import "../ERC721Permit.sol";

/** @title VaultFactory
 *   Factory for creating and registering AssetVaults
 *   Note: TokenId is simply a uint representation of the vault address
 *   To enable simple lookups from vault <-> tokenId
 */
contract VaultFactory is ERC721Enumerable, ERC721Permit, IVaultFactory {
    address public immutable template;
    address public immutable whitelist;

    constructor(address _template, address _whitelist)
        ERC721("Asset Wrapper V2", "AW-V2")
        ERC721Permit("Asset Wrapper V2")
    {
        require(_template != address(0), "VaultFactory: invalid template");
        template = _template;
        whitelist = _whitelist;
    }

    /**
     * @inheritdoc IVaultFactory
     */
    function isInstance(address instance) external view override returns (bool validity) {
        return _exists(uint256(uint160(instance)));
    }

    /**
     * @inheritdoc IVaultFactory
     */
    function instanceCount() external view override returns (uint256 count) {
        return totalSupply();
    }

    /**
     * @inheritdoc IVaultFactory
     */
    function instanceAt(uint256 index) external view override returns (address instance) {
        return address(uint160(tokenByIndex(index)));
    }

    /**
     * @dev Creates a new bundle token for `to`. Its token ID will be
     * automatically assigned (and available on the emitted {IERC721-Transfer} event)
     *
     * See {ERC721-_mint}.
     */
    function initializeBundle(address to) external override returns (uint256) {
        address vault = _create();

        _mint(to, uint256(uint160(vault)));

        emit VaultCreated(vault, to);
        return uint256(uint160(vault));
    }

    /**
     * @dev Creates and initializes a minimal proxy vault instance
     */
    function _create() internal returns (address vault) {
        vault = Clones.clone(template);
        IAssetVault(vault).initialize(whitelist);
        return vault;
    }

    /**
     * @dev Hook that is called before any token transfer
     * @dev note this notifies the vault contract about the ownership transfer
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
