// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "./interfaces/IWrappedPunks.sol";
import "./interfaces/IAssetWrapper.sol";
import "./interfaces/IPunks.sol";

/**
 * @dev {ERC721} Router contract allowing users to automatically
 *  wrap and deposit original cryptopunks into the AssetWrapper
 */
contract PunkRouter is ERC721Holder {
    IAssetWrapper public assetWrapper;
    IWrappedPunks public wrappedPunks;
    IPunks public punks;
    address public proxy;

    constructor(
        IAssetWrapper _assetWrapper,
        IWrappedPunks _wrappedPunks,
        IPunks _punks
    ) {
        assetWrapper = _assetWrapper;
        punks = _punks;
        wrappedPunks = _wrappedPunks;
        wrappedPunks.registerProxy();
        proxy = wrappedPunks.proxyInfo(address(this));
    }

    /**
     * @dev Wrap and deposit an original cryptopunk into an AssetWrapper bundle
     *
     * @param punkIndex The index of the CryptoPunk to deposit
     * @param bundleId The id of the wNFT to deposit into
     *
     * Requirements:
     *
     * - CryptoPunk punkIndex must be offered for sale to this address for 0 ETH
     *      Equivalent to an approval for normal ERC721s
     * - msg.sender must be the owner of punkIndex
     */
    function depositPunk(uint256 punkIndex, uint256 bundleId) external {
        IPunks _punks = punks;
        IWrappedPunks _wrappedPunks = wrappedPunks;
        IAssetWrapper _assetWrapper = assetWrapper;
        address owner = _punks.punkIndexToAddress(punkIndex);
        require(owner == msg.sender, "PunkRouter: not owner");
        _punks.buyPunk(punkIndex);
        _punks.transferPunk(proxy, punkIndex);

        _wrappedPunks.mint(punkIndex);
        _wrappedPunks.approve(address(_assetWrapper), punkIndex);
        _assetWrapper.depositERC721(address(_wrappedPunks), punkIndex, bundleId);
    }
}
