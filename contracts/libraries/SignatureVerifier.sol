// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../interfaces/IVaultFactory.sol";
import "../interfaces/IAssetVault.sol";
import "../interfaces/ISignatureVerifier.sol";
import "./LoanLibrary.sol";

/**
 * This contract can be used for verifying complex signature-encoded
 * bundle descriptions. This resolves on a new array of SignatureItems[],
 * which outside of verification, is passed around as bytes memory.
 *
 * Each SignatureItem has four fields:
 *      - cType (collateral Type)
 *      - asset (contract address of the asset)
 *      - tokenId (token ID of the asset, if applicable)
 *      - amount (amount of the asset, if applicable)
 *
 * - For token ids part of ERC721, other features beyond direct tokenIds are supported:
 *      - A provided token id of -1 is a wildcard, meaning any token ID is accepted.
 *      - Wildcard token ids are not supported for ERC1155.
 * - All amounts are taken as minimums. For instance, if the "amount" field of an ERC1155 is 5,
 *      then a bundle with 8 of those ERC1155s are accepted.
 * - For an ERC20 cType, tokenId is ignored. For an ERC721 cType, amount is ignored.
 *
 * - Any deviation from the above rules represents an unparseable signature and will always
 *      return invalid.
 *
 * - All multi-item signatures assume AND - any optional expressed by OR
 *      can be implemented by simply signing multiple separate signatures.
 */
abstract contract ArcadeSignatureVerifier is IArcadeSignatureVerifier, EIP712 {
    using SafeCast for int256;

    /// @notice EIP712 type hash for bundle-based signatures.
    bytes32 private constant _BUNDLE_TYPEHASH =
        keccak256(
            // solhint-disable-next-line max-line-length
            "LoanTerms(uint256 durationSecs,uint256 principal,uint256 interest,uint256 bundleId,address payableCurrency)"
        );

    /// @notice EIP712 type hash for item-based signatures.
    bytes32 private constant _ITEMS_TYPEHASH =
        keccak256(
            // solhint-disable-next-line max-line-length
            "LoanTerms(uint256 durationSecs,uint256 principal,uint256 interest,bytes items,address payableCurrency)"
        );

    /**
     * @notice Initialized needed EIP712 fields for signature verification.
     *
     * @param name                          The name of the contract.
     * @param version                       The version of the contract.
     */
    constructor(string memory name, string memory version) EIP712(name, version) {}

    /**
     * @notice Determine the external signer for a signature specifying only a bundle ID.
     *
     * @param loanTerms                     The terms of the loan.
     * @param v                             Part of the signature.
     * @param r                             Part of the signature.
     * @param s                             Part of the signature.
     *
     * @return signer                       The address of the recovered signer.
     */
    function recoverBundleSignature(
        LoanLibrary.LoanTerms calldata loanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public view override returns (address signer) {
        bytes32 loanHash = keccak256(
            abi.encode(
                _BUNDLE_TYPEHASH,
                loanTerms.durationSecs,
                loanTerms.principal,
                loanTerms.interest,
                loanTerms.bundleId,
                loanTerms.payableCurrency
            )
        );

        bytes32 typedLoanHash = _hashTypedDataV4(loanHash);
        signer = ECDSA.recover(typedLoanHash, v, r, s);
    }

    /**
     * @notice Determine the external signer for a signature specifying specific items.
     * @dev    Bundle ID should _not_ be included in this signature, because the loan
     *         can be initiated with any arbitrary bundle - as long as the bundle contains the items.
     *
     * @param loanTerms                     The terms of the loan.
     * @param v                             Part of the signature.
     * @param r                             Part of the signature.
     * @param s                             Part of the signature.
     * @param items                         The required items in the specified bundle.
     *
     * @return signer                       The address of the recovered signer.
     */
    function recoverItemsSignature(
        LoanLibrary.LoanTerms calldata loanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes calldata items
    ) public view override returns (address signer) {
        bytes32 loanHash = keccak256(
            abi.encode(
                _ITEMS_TYPEHASH,
                loanTerms.durationSecs,
                loanTerms.principal,
                loanTerms.interest,
                items,
                loanTerms.payableCurrency
            )
        );

        bytes32 typedLoanHash = _hashTypedDataV4(loanHash);
        signer = ECDSA.recover(typedLoanHash, v, r, s);
    }

    /**
     * @notice Verify that the items specified by the packed SignatureItem array are held by the vault.
     * @dev    Reverts on a malformed SignatureItem, returns false on missing contents.
     *
     * @param itemsPacked                   The SignatureItem[] array of items, packed in bytes.
     * @param vault                         The vault that should own the specified items.
     *
     * @return verified                     Whether the bundle contains the specified items.
     */
    // solhint-disable-next-line code-complexity
    function verifyItems(
        bytes calldata itemsPacked,
        address vault
    ) public view override returns (bool) {
        // Unpack items
        (LoanLibrary.SignatureItem[] memory items) = abi.decode(itemsPacked, (LoanLibrary.SignatureItem[]));

        for (uint256 i = 0; i < items.length; i++) {
            LoanLibrary.SignatureItem memory item = items[i];

            // No asset provided
            require(item.asset != address(0), "item format: missing address");

            if (item.cType == LoanLibrary.CollateralType.ERC_721) {
                IERC721 asset = IERC721(item.asset);
                int256 id = item.tokenId;

                // Wildcard, but vault has no assets
                if (id == -1 && asset.balanceOf(vault) == 0) return false;

                // Does not own specifically specified asset
                if (id >= 0 && asset.ownerOf(id.toUint256()) != vault) return false;

            } else if (item.cType == LoanLibrary.CollateralType.ERC_1155) {
                IERC1155 asset = IERC1155(item.asset);

                int256 id = item.tokenId;
                uint256 amt = item.amount;

                // Cannot require 0 amount
                require(amt >= 0, "item format: zero amount on 1155");

                // Wildcard not allowed for 1155
                require(id >= 0, "item format: wildcard on 1155");

                // Does not own specifically specified asset
                if (asset.balanceOf(vault, id.toUint256()) < amt) return false;

            } else if (item.cType == LoanLibrary.CollateralType.ERC_20) {
                IERC20 asset = IERC20(item.asset);

                uint256 amt = item.amount;

                // Cannot require 0 amount
                require(amt >= 0, "item format: zero amount on 20");

                // Does not own specifically specified asset
                if (asset.balanceOf(vault) < amt) return false;

            } else {
                // Interface could not be parsed - fail
                revert("item format: invalid cType");
            }
        }

        // Loop completed - all items found
        return true;
    }
}