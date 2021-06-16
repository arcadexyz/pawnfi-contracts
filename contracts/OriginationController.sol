pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./interfaces/IOriginationController.sol";
import "./interfaces/ILoanCore.sol";
import "./interfaces/IERC721Permit.sol";

contract OriginationController is Context, IOriginationController {
    address public loanCore;
    address public assetWrapper;
    using ECDSA for bytes32;

    constructor(address _loanCore, address _assetWrapper) {
        require(_loanCore != address(0), "loanCore address must be defined");
        loanCore = _loanCore;
        assetWrapper = _assetWrapper;
    }

    /**
     * @inheritdoc IOriginationController
     */
    function initializeLoan(
        LoanData.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override {
        require(_msgSender() == lender || _msgSender() == borrower, "Origination: sender not participant");

        bytes32 loanHash =
            keccak256(
                abi.encodePacked(
                    loanTerms.dueDate,
                    loanTerms.principal,
                    loanTerms.interest,
                    loanTerms.collateralTokenId,
                    loanTerms.payableCurrency
                )
            );

        address externalSigner = loanHash.toEthSignedMessageHash().recover(v, r, s);

        //ensures that the person who initializes the loan cannot initiate and sign the same loan
        require(
            (externalSigner == lender && externalSigner != _msgSender()) ||
                (externalSigner == borrower && externalSigner != _msgSender()),
            "external signer must be borrower or lender"
        );

        TransferHelper.safeTransferFrom(loanTerms.payableCurrency, lender, loanCore, loanTerms.principal);
        IERC721(address(this)).transferFrom(borrower, loanCore, loanTerms.collateralTokenId);

        uint256 loanId = ILoanCore(loanCore).createLoan(loanTerms);
        ILoanCore(loanCore).startLoan(lender, borrower, loanId);
    }

    /**
     * @inheritdoc IOriginationController
     */
    function initializeLoanWithCollateralPermit(
        LoanData.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint8 collateralV,
        bytes32 collateralR,
        bytes32 collateralS
    ) external override {
        IERC721Permit(assetWrapper).permit(
            borrower,
            address(this),
            loanTerms.collateralTokenId,
            block.timestamp,
            collateralV,
            collateralR,
            collateralS
        );

        initializeLoan(loanTerms, borrower, lender, v, r, s);
    }
}
