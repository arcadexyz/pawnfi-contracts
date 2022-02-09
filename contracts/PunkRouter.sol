// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IWrappedPunks.sol";
import "./interfaces/IPunks.sol";

/**
 * @dev {ERC721} Router contract allowing users to automatically
 *  wrap and deposit original cryptopunks into the AssetWrapper
 */
contract PunkRouter is ERC721Holder, Ownable {
    address public immutable assetWrapper;
    IPunks public immutable punks;
    address public immutable proxy;
    IWrappedPunks public wrappedPunks;

    constructor(
        address _assetWrapper,
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
        IWrappedPunks _wrappedPunks = wrappedPunks;
        address punkOwner = punks.punkIndexToAddress(punkIndex);
        require(punkOwner == msg.sender, "PunkRouter: not owner");
        punks.buyPunk(punkIndex);
        punks.transferPunk(proxy, punkIndex);

        _wrappedPunks.mint(punkIndex);
        _wrappedPunks.safeTransferFrom(address(this), address(uint160(bundleId)), punkIndex);
    }

    /**
     * @dev Withdraw the crypto punk that is accidentally held by the PunkRouter contract
     *
     * @param punkIndex The index of the CryptoPunk to withdraw
     * @param to The address of the new owner
     */
    function withdrawPunk(uint256 punkIndex, address to) external onlyOwner {
        punks.transferPunk(to, punkIndex);
    }
}
