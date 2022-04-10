// SPDX-License-Identifier: MIT

pragma solidity ^0.8.11;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./libraries/SignatureVerifier.sol";

import "./interfaces/IOriginationController.sol";
import "./interfaces/ILoanCore.sol";
import "./interfaces/IERC721Permit.sol";
import "./interfaces/IAssetVault.sol";
import "./interfaces/IVaultFactory.sol";

// TODO: Flexible asset vaults, defined per loan.
// TODO: Add signing nonce
// TODO: add nonReentrant

/**
 * @title OriginationController
 * @author Non-Fungible Technologies, Inc.
 *
 * The Origination Controller is the entry point for all new loans
 * in the Arcade.xyz lending protocol. This contract should have the
 * exclusive responsibility to create new loans in LoanCore. All
 * permissioning, signature verification, and collateral verification
 * takes place in this contract. To originate a loan, the controller
 * also takes custody of both the collateral and loan principal.
 */
contract OriginationController is ArcadeSignatureVerifier, Context, IOriginationController {
    using SafeERC20 for IERC20;

    // ============================================ STATE ==============================================

    // ============= Global Immutable State ==============

    address public immutable loanCore;
    address public immutable vaultFactory;

    // ================= Approval State ==================

    /// @notice Mapping from owner to operator approvals
    mapping(address => mapping(address => bool)) private _signerApprovals;

    // ========================================== CONSTRUCTOR ===========================================

    /**
     * @notice Creates a new origination controller contract, also initializing
     * the parent signature verifier.
     *
     * @dev For this controller to work, it needs to be granted the ORIGINATOR_ROLE
     *      in loan core after deployment.
     *
     * @param _loanCore                     The address of the loan core logic of the protocol.
     * @param _vaultFactory                 The address of the factory for the asset vaults used by the protocol.
     */
    constructor(address _loanCore, address _vaultFactory) ArcadeSignatureVerifier("OriginationController", "2") {
        require(_loanCore != address(0), "Origination: loanCore not defined");
        loanCore = _loanCore;
        vaultFactory = _vaultFactory;
    }

    // ==================================== ORIGINATION OPERATIONS ======================================

    /**
     * @notice Initializes a loan with Loan Core.
     *
     * @dev The caller must be a borrower or lender, or approved by a borrower or lender.
     * @dev The external signer must be a borrower or lender, or approved by a borrower or lender.
     * @dev The external signer must come from the oppoite side of the loan as the caller.
     *
     * @param loanTerms                     The terms agreed by the lender and borrower.
     * @param borrower                      Address of the borrower.
     * @param lender                        Address of the lender.
     * @param v                             Part of the loan terms signature.
     * @param r                             Part of the loan terms signature.
     * @param s                             Part of the loan terms signature.
     *
     * @return loanId                       The unique ID of the new loan.
     */
    function initializeLoan(
        LoanLibrary.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override returns (uint256 loanId) {
        require(
            isSelfOrApproved(lender, msg.sender) || isSelfOrApproved(borrower, msg.sender),
            "Origination: signer not participant"
        );

        // vault must be in withdraw-disabled state,
        // otherwise its unsafe as assets could have been withdrawn to frontrun this call
        require(
            !IAssetVault(IVaultFactory(vaultFactory).instanceAt(loanTerms.bundleId)).withdrawEnabled(),
            "Origination: withdraws enabled"
        );

        address externalSigner = recoverBundleSignature(
            loanTerms,
            v,
            r,
            s
        );

        // Make sure one from each side approves
        if (isSelfOrApproved(lender, externalSigner)) {
            require(externalSigner != _msgSender() && externalSigner != lender, "Origination: approved own loan");
        } else if (isSelfOrApproved(borrower, externalSigner)) {
            require(externalSigner != _msgSender() && externalSigner != borrower, "Origination: approved own loan");
        } else {
            revert("Origination: signer not participant");
        }

        // Take custody of funds
        IERC20(loanTerms.payableCurrency).safeTransferFrom(lender, address(this), loanTerms.principal);
        IERC20(loanTerms.payableCurrency).approve(loanCore, loanTerms.principal);
        IERC721(vaultFactory).transferFrom(borrower, address(this), loanTerms.bundleId);
        IERC721(vaultFactory).approve(loanCore, loanTerms.bundleId);

        // Start loan
        loanId = ILoanCore(loanCore).createLoan(loanTerms);
        ILoanCore(loanCore).startLoan(lender, borrower, loanId);
    }

    /**
     * @notice Initializes a loan with Loan Core.
     * @notice Compared to initializeLoan, this verifies the specific items in a bundle.
     *
     * @dev The caller must be a borrower or lender, or approved by a borrower or lender.
     * @dev The external signer must be a borrower or lender, or approved by a borrower or lender.
     * @dev The external signer must come from the oppoite side of the loan as the caller.
     *
     * @param loanTerms                     The terms agreed by the lender and borrower.
     * @param borrower                      Address of the borrower.
     * @param lender                        Address of the lender.
     * @param v                             Part of the loan terms signature.
     * @param r                             Part of the loan terms signature.
     * @param s                             Part of the loan terms signature.
     * @param collateralItems               The items required to be present in the bundle.
     *
     * @return loanId                       The unique ID of the new loan.
     */
    function initializeLoanWithItems(
        LoanLibrary.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes calldata collateralItems
    ) public override returns (uint256 loanId) {
        require(_msgSender() == lender || _msgSender() == borrower, "Origination: sender not participant");

        address vault = IVaultFactory(vaultFactory).instanceAt(loanTerms.bundleId);

        // vault must be in withdraw-disabled state,
        // otherwise its unsafe as assets could have been withdrawn to frontrun this call
        // TODO: Can we delete this with an items signature?
        require(
            !IAssetVault(vault).withdrawEnabled(),
            "Origination: withdraws enabled"
        );

        address externalSigner = recoverItemsSignature(
            loanTerms,
            v,
            r,
            s,
            collateralItems
        );

        require(
            isSelfOrApproved(lender, externalSigner) || isSelfOrApproved(borrower, externalSigner),
            "Origination: signer not participant"
        );

        require(externalSigner != _msgSender(), "Origination: approved own loan");

        // Verify items are held in the wrapper
        require(verifyItems(collateralItems, vault), "Origination: missing required items");

        IERC20(loanTerms.payableCurrency).safeTransferFrom(lender, address(this), loanTerms.principal);
        IERC20(loanTerms.payableCurrency).approve(loanCore, loanTerms.principal);
        IERC721(vaultFactory).transferFrom(borrower, address(this), loanTerms.bundleId);
        IERC721(vaultFactory).approve(loanCore, loanTerms.bundleId);

        loanId = ILoanCore(loanCore).createLoan(loanTerms);
        ILoanCore(loanCore).startLoan(lender, borrower, loanId);
    }

    /**
     * @notice Initializes a loan with Loan Core, with a permit signature instead of pre-approved collateral.
     *
     * @dev The caller must be a borrower or lender, or approved by a borrower or lender.
     * @dev The external signer must be a borrower or lender, or approved by a borrower or lender.
     * @dev The external signer must come from the oppoite side of the loan as the caller.
     *
     * @param loanTerms                     The terms agreed by the lender and borrower.
     * @param borrower                      Address of the borrower.
     * @param lender                        Address of the lender.
     * @param v                             Part of the loan terms signature.
     * @param r                             Part of the loan terms signature.
     * @param s                             Part of the loan terms signature.
     * @param collateralV                   Part of the collateral permit signature.
     * @param collateralR                   Part of the collateral permit signature.
     * @param collateralS                   Part of the collateral permit signature.
     * @param permitDeadline                The last timestamp for which the signature is valid.
     *
     * @return loanId                       The unique ID of the new loan.
     */
    function initializeLoanWithCollateralPermit(
        LoanLibrary.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint8 collateralV,
        bytes32 collateralR,
        bytes32 collateralS,
        uint256 permitDeadline
    ) external override returns (uint256 loanId) {
        IERC721Permit(vaultFactory).permit(
            borrower,
            address(this),
            loanTerms.bundleId,
            permitDeadline,
            collateralV,
            collateralR,
            collateralS
        );

        loanId = initializeLoan(loanTerms, borrower, lender, v, r, s);
    }

    /**
     * @notice Initializes a loan with Loan Core, with a permit signature instead of pre-approved collateral.
     * @notice Compared to initializeLoanWithCollateralPermit, this verifies the specific items in a bundle.
     *
     * @dev The caller must be a borrower or lender, or approved by a borrower or lender.
     * @dev The external signer must be a borrower or lender, or approved by a borrower or lender.
     * @dev The external signer must come from the oppoite side of the loan as the caller.
     *
     * @param loanTerms                     The terms agreed by the lender and borrower.
     * @param borrower                      Address of the borrower.
     * @param lender                        Address of the lender.
     * @param v                             Part of the loan terms signature.
     * @param r                             Part of the loan terms signature.
     * @param s                             Part of the loan terms signature.
     * @param collateralV                   Part of the collateral permit signature.
     * @param collateralR                   Part of the collateral permit signature.
     * @param collateralS                   Part of the collateral permit signature.
     * @param permitDeadline                The last timestamp for which the signature is valid.
     * @param collateralItems               The items required to be present in the bundle.
     *
     * @return loanId                       The unique ID of the new loan.
     */
    function initializeLoanWithCollateralPermitAndItems(
        LoanLibrary.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint8 collateralV,
        bytes32 collateralR,
        bytes32 collateralS,
        uint256 permitDeadline,
        bytes calldata collateralItems
    ) external override returns (uint256 loanId) {
        IERC721Permit(vaultFactory).permit(
            borrower,
            address(this),
            loanTerms.bundleId,
            permitDeadline,
            collateralV,
            collateralR,
            collateralS
        );

        loanId = initializeLoanWithItems(loanTerms, borrower, lender, v, r, s, collateralItems);
    }

    // ==================================== PERMISSION MANAGEMENT =======================================

    /**
     * @notice Approve a third party to sign or initialize loans on a counterparties' behalf.
     * @notice Useful to multisig counterparties (who cannot sign themselves) or third-party integrations.
     *
     * @param signer                        The party to set approval for.
     * @param approved                      Whether the party should be approved.
     */
    function approve(address signer, bool approved) public override {
        require(signer != msg.sender, "Origination: approve to caller");

        _signerApprovals[msg.sender][signer] = approved;

        emit Approval(msg.sender, signer);
    }

    /**
     * @notice Reports whether a party is approved to act on a counterparties' behalf.
     *
     * @param owner                         The grantor of permission.
     * @param signer                        The grantee of permission.
     *
     * @return isApproved                   Whether the grantee has been approved by the grantor.
     */
    function isApproved(address owner, address signer) public view override returns (bool) {
        return _signerApprovals[owner][signer];
    }

    /**
     * @notice Reports whether the signer matches the target or is approved by the target.
     *
     * @param target                        The grantor of permission.
     * @param signer                        The grantee of permission.
     *
     * @return isSelfOrApproved             Whether the signer is either the grantor themselves, or approved.
     */
    function isSelfOrApproved(address target, address signer) public view override returns (bool) {
        return target == signer || isApproved(target, signer);
    }
}
