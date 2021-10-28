pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./interfaces/ILendingPool.sol";
import "./interfaces/ILoanCore.sol";
import "./interfaces/IOriginationController.sol";
import "./interfaces/IRepaymentController.sol";
import "./interfaces/IAssetWrapper.sol";
import "./interfaces/IFeeController.sol";

interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

contract FlashRollover is IFlashLoanReceiver {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    ILendingPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    ILendingPool public immutable LENDING_POOL;

    ILoanCore public immutable LOAN_CORE;
    ILoanCore public immutable LEGACY_LOAN_CORE;
    IOriginationController public immutable ORIGINATION_CONTROLLER;
    IRepaymentController public immutable LEGACY_REPAYMENT_CONTROLLER;
    IRepaymentController public immutable REPAYMENT_CONTROLLER;
    IERC721 public immutable BORROWER_NOTE;
    IERC721 public immutable LENDER_NOTE;
    IERC721 public immutable LEGACY_BORROWER_NOTE;
    IERC721 public immutable LEGACY_LENDER_NOTE;
    IERC721 public immutable ASSET_WRAPPER;
    IFeeController public immutable FEE_CONTROLLER;

    constructor(
        ILendingPoolAddressesProvider provider,
        ILoanCore loanCore,
        IOriginationController originationController,
        IRepaymentController repaymentController,
        IERC721 borrowerNote,
        IERC721 lenderNote,
        IERC721 assetWrapper,
        IFeeController feeController
    ) {
        // TODO put in initializer

        ADDRESSES_PROVIDER = provider;
        LENDING_POOL = ILendingPool(provider.getLendingPool());
        LOAN_CORE = loanCore;
        ORIGINATION_CONTROLLER = originationController;
        REPAYMENT_CONTROLLER = repaymentController;
        BORROWER_NOTE = borrowerNote;
        LENDER_NOTE = lenderNote;
        ASSET_WRAPPER = assetWrapper;
        FEE_CONTROLLER = feeController;
    }

    function rolloverLoan(
        uint256 loanId,
        LoanLibrary.LoanTerms calldata newLoanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        // Get loan details
        LoanLibrary.LoanData memory loanData = LOAN_CORE.getLoan(loanId);
        LoanLibrary.LoanTerms memory terms = loanData.terms;
        uint256 amountDue = terms.principal.add(terms.interest);

        require(newLoanTerms.payableCurrency == terms.payableCurrency, "Currency mismatch");
        require(newLoanTerms.collateralTokenId == terms.collateralTokenId, "Collateral mismatch");

        address[] memory assets = new address[](1);
        assets[0] = terms.payableCurrency;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amountDue;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        bytes memory params = abi.encode(loanId, v, r, s);

        // Flash loan based on principal + interest
        LENDING_POOL.flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this),
            params,
            0 // TODO: Add referral code?
        );
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool result) {
        require(initiator == address(this), "Not initiator");

        (
            bool isLegacy,
            uint256 loanId,
            LoanLibrary.LoanTerms memory newLoanTerms,
            uint8 v,
            bytes32 r,
            bytes32 s
        ) = abi.decode(params, (bool, uint256, LoanLibrary.LoanTerms, uint8, bytes32, bytes32));

        _executeOperation(
            isLegacy,
            assets,
            amounts,
            premiums,
            loanId,
            newLoanTerms,
            v,
            r,
            s
        );
    }

    function _executeOperation(
        bool isLegacy,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        uint256 loanId,
        LoanLibrary.LoanTerms memory newLoanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal returns (bool) {
        (
            ILoanCore loanCore,
            IERC721 borrowerNote,
            IERC721 lenderNote,
            IFeeController feeController,
            IERC721 assetWrapper,
            IRepaymentController repaymentController,
            IOriginationController originationController,
            ILoanCore newLoanLoanCore,
            IERC721 newLoanBorrowerNote
        ) = _getContracts(isLegacy);

        uint256 flashAmountDue = amounts[0].add(premiums[0]);

        // Get loan details
        LoanLibrary.LoanData memory loanData = loanCore.getLoan(loanId);
        uint256 borrowerNoteId = loanData.borrowerNoteId;
        require(borrowerNoteId != 0, "Cannot find note");

        address borrower = borrowerNote.ownerOf(borrowerNoteId);
        address lender = lenderNote.ownerOf(loanData.lenderNoteId);

        // Make sure new loan, minus pawn fees, can be repaid
        uint256 newPrincipal = newLoanTerms.principal
            .sub(newLoanTerms.principal * feeController.getOriginationFee())
            .div(10_000);

        if (flashAmountDue > newPrincipal) {
            // Not enough - have borrower pay the difference
            IERC20(assets[0]).transferFrom(borrower, address(this), flashAmountDue - newPrincipal);
        }

        require(newPrincipal > flashAmountDue, "Cannot repay flash loan with new principal");

        uint256 leftoverPrincipal;
        if (newPrincipal > flashAmountDue) {
            leftoverPrincipal = newPrincipal - flashAmountDue;
        }

        // Take BorrowerNote from borrower
        // Must be approved for withdrawal
        borrowerNote.transferFrom(
            borrower,
            address(this),
            borrowerNoteId
        );

        // Repay loan
        IERC20(assets[0]).approve(
            address(repaymentController),
            amounts[0]
        );
        repaymentController.repay(borrowerNoteId);

        LoanLibrary.LoanTerms memory terms = loanData.terms;
        // contract now has asset wrapper but has lost funds
        require(
            assetWrapper.ownerOf(terms.collateralTokenId) == address(this),
            "Post-loan: not owner of collateral"
        );

        // approve originationController
        assetWrapper.approve(address(originationController), terms.collateralTokenId);

        // start new loan
        uint256 newLoanId = originationController.initializeLoan(newLoanTerms, borrower, lender, v, r, s);
        LoanLibrary.LoanData memory newLoanData = newLoanLoanCore.getLoan(newLoanId);

        // Send note and leftover principal to borrower
        newLoanBorrowerNote.safeTransferFrom(address(this), borrower, newLoanData.borrowerNoteId);

        if (leftoverPrincipal > 0) {
            IERC20(newLoanTerms.payableCurrency).transfer(borrower, leftoverPrincipal);
        }

        // Approve all amounts for flash loan repayment
        IERC20(assets[0]).approve(address(LENDING_POOL), flashAmountDue);

        return true;
    }

    function _getContracts(bool isLegacy) internal returns (
        ILoanCore,
        IERC721,
        IERC721,
        IFeeController,
        IERC721,
        IRepaymentController,
        IOriginationController,
        ILoanCore,
        IERC721
    ) {
        if (isLegacy) {
            return (
                LEGACY_LOAN_CORE,
                LEGACY_BORROWER_NOTE,
                LEGACY_LENDER_NOTE,
                FEE_CONTROLLER,
                ASSET_WRAPPER,
                LEGACY_REPAYMENT_CONTROLLER,
                ORIGINATION_CONTROLLER,
                LOAN_CORE,
                BORROWER_NOTE
            );
        } else {
            return (
                LOAN_CORE,
                BORROWER_NOTE,
                LENDER_NOTE,
                FEE_CONTROLLER,
                ASSET_WRAPPER,
                REPAYMENT_CONTROLLER,
                ORIGINATION_CONTROLLER,
                LOAN_CORE,
                BORROWER_NOTE
            );
        }
    }
}
