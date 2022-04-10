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


// TODO: Support different bundle types

contract OriginationController is ArcadeSignatureVerifier, Context, IOriginationController {
    using SafeERC20 for IERC20;
    address public immutable loanCore;
    address public immutable vaultFactory;

    constructor(address _loanCore, address _vaultFactory) ArcadeSignatureVerifier("OriginationController", "2") {
        require(_loanCore != address(0), "Origination: loanCore not defined");
        loanCore = _loanCore;
        vaultFactory = _vaultFactory;
    }

    /**
     * @inheritdoc IOriginationController
     */
    function initializeLoan(
        LoanLibrary.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override returns (uint256 loanId) {
        require(_msgSender() == lender || _msgSender() == borrower, "Origination: sender not participant");
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

        require(externalSigner == lender || externalSigner == borrower, "Origination: signer not participant");
        require(externalSigner != _msgSender(), "Origination: approved own loan");

        IERC20(loanTerms.payableCurrency).safeTransferFrom(lender, address(this), loanTerms.principal);
        IERC20(loanTerms.payableCurrency).approve(loanCore, loanTerms.principal);
        IERC721(vaultFactory).transferFrom(borrower, address(this), loanTerms.bundleId);
        IERC721(vaultFactory).approve(loanCore, loanTerms.bundleId);

        loanId = ILoanCore(loanCore).createLoan(loanTerms);
        ILoanCore(loanCore).startLoan(lender, borrower, loanId);
    }

    /**
     * @inheritdoc IOriginationController
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

        require(externalSigner == lender || externalSigner == borrower, "Origination: signer not participant");
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
     * @inheritdoc IOriginationController
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
     * @inheritdoc IOriginationController
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
}
