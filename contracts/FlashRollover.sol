pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./external/interfaces/ILendingPool.sol";

import "./interfaces/IFlashRollover.sol";
import "./interfaces/ILoanCore.sol";
import "./interfaces/IOriginationController.sol";
import "./interfaces/IRepaymentController.sol";
import "./interfaces/IAssetWrapper.sol";
import "./interfaces/IFeeController.sol";

contract FlashRollover is IFlashRollover {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /**
     * Holds parameters passed through flash loan
     * control flow that dictate terms of the new loan.
     * Contains a signature by lender for same terms.
     * isLegacy determines which loanCore to look for the
     * old loan in.
     */
    struct OperationData {
        bool isLegacy;
        uint256 loanId;
        LoanLibrary.LoanTerms newLoanTerms;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /**
     * Defines the contracts that should be used for a
     * flash loan operation. May change based on if the
     * old loan is on the current loanCore or legacy (in
     * which case it requires migration).
     */
    struct OperationContracts {
        ILoanCore loanCore;
        IERC721 borrowerNote;
        IERC721 lenderNote;
        IFeeController feeController;
        IERC721 assetWrapper;
        IRepaymentController repaymentController;
        IOriginationController originationController;
        ILoanCore newLoanLoanCore;
        IERC721 newLoanBorrowerNote;
    }

    /* solhint-disable var-name-mixedcase */
    // AAVE Contracts
    // Variable names are in upper case to fulfill IFlashLoanReceiver interface
    ILendingPoolAddressesProvider public immutable override ADDRESSES_PROVIDER;
    ILendingPool public immutable override LENDING_POOL;
    /* solhint-enable var-name-mixedcase */

    // Pawn.fi Contracts
    ILoanCore public immutable loanCore;
    ILoanCore public immutable legacyLoanCore;
    IOriginationController public immutable originationController;
    IRepaymentController public immutable legacyRepaymentController;
    IRepaymentController public immutable repaymentController;
    IERC721 public immutable borrowerNote;
    IERC721 public immutable lenderNote;
    IERC721 public immutable legacyBorrowerNote;
    IERC721 public immutable legacyLenderNote;
    IERC721 public immutable assetWrapper;
    IFeeController public immutable feeController;

    constructor(
        ILendingPoolAddressesProvider _addressesProvider,
        ILoanCore _loanCore,
        ILoanCore _legacyLoanCore,
        IOriginationController _originationController,
        IRepaymentController _repaymentController,
        IRepaymentController _legacyRepaymentController,
        IERC721 _borrowerNote,
        IERC721 _legacyBorrowerNote,
        IERC721 _lenderNote,
        IERC721 _legacyLenderNote,
        IERC721 _assetWrapper,
        IFeeController _feeController
    ) {
        ADDRESSES_PROVIDER = _addressesProvider;
        LENDING_POOL = ILendingPool(_addressesProvider.getLendingPool());
        loanCore = _loanCore;
        legacyLoanCore = _legacyLoanCore;
        originationController = _originationController;
        repaymentController = _repaymentController;
        legacyRepaymentController = _legacyRepaymentController;
        borrowerNote = _borrowerNote;
        legacyBorrowerNote = _legacyBorrowerNote;
        lenderNote = _lenderNote;
        legacyLenderNote = _legacyLenderNote;
        assetWrapper = _assetWrapper;
        feeController = _feeController;
    }

    function rolloverLoan(
        bool isLegacy,
        uint256 loanId,
        LoanLibrary.LoanTerms calldata newLoanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        // Get loan details
        LoanLibrary.LoanData memory loanData;
        if (isLegacy) {
            loanData = legacyLoanCore.getLoan(loanId);
            uint256 borrowerNoteId = loanData.borrowerNoteId;

            address borrower = legacyBorrowerNote.ownerOf(borrowerNoteId);
            require(borrower == msg.sender, "Rollover: borrower only");
        } else {
            loanData = loanCore.getLoan(loanId);
            uint256 borrowerNoteId = loanData.borrowerNoteId;

            address borrower = borrowerNote.ownerOf(borrowerNoteId);
            require(borrower == msg.sender, "Rollover: borrower only");
        }

        LoanLibrary.LoanTerms memory terms = loanData.terms;
        uint256 amountDue = terms.principal.add(terms.interest);

        require(newLoanTerms.payableCurrency == terms.payableCurrency, "Currency mismatch");
        require(newLoanTerms.collateralTokenId == terms.collateralTokenId, "Collateral mismatch");

        uint256 startBalance = IERC20(terms.payableCurrency).balanceOf(address(this));

        address[] memory assets = new address[](1);
        assets[0] = terms.payableCurrency;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amountDue;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;

        OperationData memory opData = OperationData({
            isLegacy: isLegacy,
            loanId: loanId,
            newLoanTerms: newLoanTerms,
            v: v,
            r: r,
            s: s
        });

        bytes memory params = abi.encode(opData);

        // Flash loan based on principal + interest
        LENDING_POOL.flashLoan(address(this), assets, amounts, modes, address(this), params, 1);

        // Should not have any funds leftover
        require(
            IERC20(terms.payableCurrency).balanceOf(address(this)) == startBalance,
            "Changed balance after flash loan"
        );
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // TODO: Security check.
        // Can an attacker use this to drain borrower funds? Feels like maybe

        require(msg.sender == address(LENDING_POOL), "Unknown lender");
        require(initiator == address(this), "Not initiator");
        require(IERC20(assets[0]).balanceOf(address(this)) >= amounts[0], "Did not receive loan funds");

        OperationData memory opData = abi.decode(params, (OperationData));

        return _executeOperation(assets, amounts, premiums, opData);
    }

    function _executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        OperationData memory opData
    ) internal returns (bool) {
        OperationContracts memory opContracts = _getContracts(opData.isLegacy);

        // Get loan details
        LoanLibrary.LoanData memory loanData = opContracts.loanCore.getLoan(opData.loanId);
        require(loanData.borrowerNoteId != 0, "Cannot find note");

        address borrower = opContracts.borrowerNote.ownerOf(loanData.borrowerNoteId);
        address lender = opContracts.lenderNote.ownerOf(loanData.lenderNoteId);

        // Do accounting to figure out amount each party needs to receive
        (uint256 flashAmountDue, uint256 needFromBorrower, uint256 leftoverPrincipal) = _ensureFunds(
            amounts[0],
            premiums[0],
            opContracts.feeController.getOriginationFee(),
            opData.newLoanTerms.principal
        );

        if (needFromBorrower > 0) {
            require(IERC20(assets[0]).balanceOf(borrower) >= needFromBorrower, "Borrower cannot pay");
        }

        _repayLoan(opContracts, loanData);
        uint256 newLoanId = _initializeNewLoan(opContracts, borrower, lender, loanData.terms.collateralTokenId, opData);

        if (leftoverPrincipal > 0) {
            IERC20(assets[0]).transfer(borrower, leftoverPrincipal);
        } else if (needFromBorrower > 0) {
            IERC20(assets[0]).transferFrom(borrower, address(this), needFromBorrower);
        }

        // Approve all amounts for flash loan repayment
        IERC20(assets[0]).approve(address(LENDING_POOL), flashAmountDue);

        emit Rollover(lender, borrower, loanData.terms.collateralTokenId, newLoanId);

        if (opData.isLegacy) {
            emit Migration(address(opContracts.loanCore), address(opContracts.newLoanLoanCore), newLoanId);
        }

        return true;
    }

    function _ensureFunds(
        uint256 amount,
        uint256 premium,
        uint256 originationFee,
        uint256 newPrincipal
    )
        internal
        pure
        returns (
            uint256 flashAmountDue,
            uint256 needFromBorrower,
            uint256 leftoverPrincipal
        )
    {
        // Make sure new loan, minus pawn fees, can be repaid
        flashAmountDue = amount + premium;
        uint256 willReceive = newPrincipal - ((newPrincipal * originationFee) / 10_000);

        if (flashAmountDue > willReceive) {
            // Not enough - have borrower pay the difference
            needFromBorrower = flashAmountDue - willReceive;
        } else if (willReceive > flashAmountDue) {
            // Too much - will send extra to borrower
            leftoverPrincipal = willReceive - flashAmountDue;
        }

        // Either leftoverPrincipal or needFromBorrower should be 0
        require(leftoverPrincipal & needFromBorrower == 0, "_ensureFunds computation");
    }

    function _repayLoan(OperationContracts memory contracts, LoanLibrary.LoanData memory loanData) internal {
        address borrower = contracts.borrowerNote.ownerOf(loanData.borrowerNoteId);

        // Take BorrowerNote from borrower
        // Must be approved for withdrawal
        contracts.borrowerNote.transferFrom(borrower, address(this), loanData.borrowerNoteId);

        // Approve repayment
        IERC20(loanData.terms.payableCurrency).approve(
            address(contracts.repaymentController),
            loanData.terms.principal + loanData.terms.interest
        );

        // Repay loan
        contracts.repaymentController.repay(loanData.borrowerNoteId);

        // contract now has asset wrapper but has lost funds
        require(
            contracts.assetWrapper.ownerOf(loanData.terms.collateralTokenId) == address(this),
            "Post-loan: not owner of collateral"
        );
    }

    function _initializeNewLoan(
        OperationContracts memory contracts,
        address borrower,
        address lender,
        uint256 collateralTokenId,
        OperationData memory opData
    ) internal returns (uint256) {
        // approve originationController
        contracts.assetWrapper.approve(address(contracts.originationController), collateralTokenId);

        // start new loan
        // stand in for borrower to meet OriginationController's requirements
        uint256 newLoanId = contracts.originationController.initializeLoan(
            opData.newLoanTerms,
            address(this),
            lender,
            opData.v,
            opData.r,
            opData.s
        );

        LoanLibrary.LoanData memory newLoanData = contracts.newLoanLoanCore.getLoan(newLoanId);
        contracts.newLoanBorrowerNote.safeTransferFrom(address(this), borrower, newLoanData.borrowerNoteId);

        return newLoanId;
    }

    function _getContracts(bool isLegacy) internal view returns (OperationContracts memory) {
        if (isLegacy) {
            return
                OperationContracts({
                    loanCore: legacyLoanCore,
                    borrowerNote: legacyBorrowerNote,
                    lenderNote: legacyLenderNote,
                    feeController: feeController,
                    assetWrapper: assetWrapper,
                    repaymentController: legacyRepaymentController,
                    originationController: originationController,
                    newLoanLoanCore: loanCore,
                    newLoanBorrowerNote: borrowerNote
                });
        } else {
            return
                OperationContracts({
                    loanCore: loanCore,
                    borrowerNote: borrowerNote,
                    lenderNote: lenderNote,
                    feeController: feeController,
                    assetWrapper: assetWrapper,
                    repaymentController: repaymentController,
                    originationController: originationController,
                    newLoanLoanCore: loanCore,
                    newLoanBorrowerNote: borrowerNote
                });
        }
    }
}
