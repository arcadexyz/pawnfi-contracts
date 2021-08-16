pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./interfaces/IOriginationController.sol";
import "./interfaces/ILoanCore.sol";
import "./interfaces/IERC721Permit.sol";

contract OriginationController is Context, IOriginationController, EIP712 {
    address public loanCore;
    address public assetWrapper;

    // solhint-disable-next-line var-name-mixedcase
    bytes32 private immutable _LOAN_TERMS_TYPEHASH =
        keccak256(
            // solhint-disable-next-line max-line-length
            "LoanTerms(uint256 durationSecs,uint256 principal,uint256 interest,uint256 collateralTokenId,address payableCurrency)"
        );

    constructor(address _loanCore, address _assetWrapper) EIP712("OriginationController", "1") {
        require(_loanCore != address(0), "Origination: loanCore not defined");
        loanCore = _loanCore;
        assetWrapper = _assetWrapper;
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
    ) public override {
        require(_msgSender() == lender || _msgSender() == borrower, "Origination: sender not participant");

        bytes32 loanHash =
            keccak256(
                abi.encode(
                    _LOAN_TERMS_TYPEHASH,
                    loanTerms.durationSecs,
                    loanTerms.principal,
                    loanTerms.interest,
                    loanTerms.collateralTokenId,
                    loanTerms.payableCurrency
                )
            );
        bytes32 typedLoanHash = _hashTypedDataV4(loanHash);
        address externalSigner = ECDSA.recover(typedLoanHash, v, r, s);

        require(externalSigner == lender || externalSigner == borrower, "Origination: signer not participant");
        require(externalSigner != _msgSender(), "Origination: approved own loan");

        SafeERC20.safeTransferFrom(IERC20(loanTerms.payableCurrency), lender, address(this), loanTerms.principal);
        IERC20(loanTerms.payableCurrency).approve(loanCore, loanTerms.principal);
        IERC721(assetWrapper).transferFrom(borrower, address(this), loanTerms.collateralTokenId);
        IERC721(assetWrapper).approve(loanCore, loanTerms.collateralTokenId);

        uint256 loanId = ILoanCore(loanCore).createLoan(loanTerms);
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
    ) external override {
        IERC721Permit(assetWrapper).permit(
            borrower,
            address(this),
            loanTerms.collateralTokenId,
            permitDeadline,
            collateralV,
            collateralR,
            collateralS
        );

        initializeLoan(loanTerms, borrower, lender, v, r, s);
    }
}
