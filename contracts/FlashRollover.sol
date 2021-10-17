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
    IOriginationController public immutable ORIGINATION_CONTROLLER;
    IRepaymentController public immutable REPAYMENT_CONTROLLER;
    IERC721 public immutable BORROWER_NOTE;
    IERC721 public immutable LENDER_NOTE;
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
    ) external override returns (bool) {
        require(initiator == address(this), "Not initiator");

        (uint256 loanId, LoanLibrary.LoanTerms memory newLoanTerms, uint8 v, bytes32 r, bytes32 s) =
            abi.decode(params, (uint256, LoanLibrary.LoanTerms, uint8, bytes32, bytes32));

        uint256 flashAmountDue = amounts[0].add(premiums[0]);

        // Make sure new loan, minus pawn fees, is more than flash amount due
        uint256 newPrincipal = newLoanTerms.principal
            .sub(newLoanTerms.principal.mul(FEE_CONTROLLER.getOriginationFee())
            .div(10_000));

        require(newPrincipal > flashAmountDue, "Cannot repay flash loan with new principal");
        uint256 leftoverPrincipal = newPrincipal.sub(flashAmountDue);

        // Get loan details
        LoanLibrary.LoanData memory loanData = LOAN_CORE.getLoan(loanId);
        uint256 borrowerNoteId = loanData.borrowerNoteId;
        require(borrowerNoteId != 0, "Cannot find note");

        address borrower = BORROWER_NOTE.ownerOf(borrowerNoteId);
        address lender = LENDER_NOTE.ownerOf(loanData.lenderNoteId);

        // Take BorrowerNote from borrower
        // Must be approved for withdrawal
        BORROWER_NOTE.transferFrom(
            borrower,
            address(this),
            borrowerNoteId
        );

        // Repay loan
        IERC20(assets[0]).approve(
            address(REPAYMENT_CONTROLLER),
            amounts[0]
        );
        REPAYMENT_CONTROLLER.repay(borrowerNoteId);

        LoanLibrary.LoanTerms memory terms = loanData.terms;
        // contract now has asset wrapper but has lost funds
        require(
            ASSET_WRAPPER.ownerOf(terms.collateralTokenId) == address(this),
            "Post-loan: not owner of collateral"
        );

        // approve originationController
        ASSET_WRAPPER.approve(address(ORIGINATION_CONTROLLER), terms.collateralTokenId);

        // start new loan
        ORIGINATION_CONTROLLER.initializeLoan(newLoanTerms, borrower, lender, v, r, s);

        // transfer new borrower note back to original borrower
        // Figure out new borrower Note id
        // BORROWER_NOTE.transfer(borrower, newB)
        // COLLATERAL IN USE?

        // Send leftover principal to borrower
        if (leftoverPrincipal > 0) {
            IERC20(newLoanTerms.payableCurrency).transfer(borrower, leftoverPrincipal);
        }
        // Approve all amounts
        IERC20(assets[0]).approve(address(LENDING_POOL), flashAmountDue);

        return true;

    }
}
