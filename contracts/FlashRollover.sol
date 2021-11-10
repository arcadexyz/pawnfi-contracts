pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./external/interfaces/ILendingPool.sol";

import "./interfaces/IFlashRollover.sol";
import "./interfaces/ILoanCore.sol";
import "./interfaces/IOriginationController.sol";
import "./interfaces/IRepaymentController.sol";
import "./interfaces/IAssetWrapper.sol";
import "./interfaces/IFeeController.sol";

/**
 *
 * @dev FlashRollover allows a borrower to roll over
 * a Pawn.fi loan into a new loan without having to
 * repay capital. It integrate with AAVE's flash loans
 * to provide repayment capital, which is then compensated
 * for by the newly-issued loan.
 *
 * Full API docs at docs/FlashRollover.md
 *
 */
contract FlashRollover is IFlashRollover {
    using SafeERC20 for IERC20;

    /**
     * Holds parameters passed through flash loan
     * control flow that dictate terms of the new loan.
     * Contains a signature by lender for same terms.
     * isLegacy determines which loanCore to look for the
     * old loan in.
     */
    struct OperationData {
        RolloverContractParams contracts;
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
        ILoanCore targetLoanCore;
        IERC721 targetBorrowerNote;
    }

    /* solhint-disable var-name-mixedcase */
    // AAVE Contracts
    // Variable names are in upper case to fulfill IFlashLoanReceiver interface
    ILendingPoolAddressesProvider public immutable override ADDRESSES_PROVIDER;
    ILendingPool public immutable override LENDING_POOL;

    /* solhint-enable var-name-mixedcase */

    constructor(ILendingPoolAddressesProvider _addressesProvider) {
        ADDRESSES_PROVIDER = _addressesProvider;
        LENDING_POOL = ILendingPool(_addressesProvider.getLendingPool());
    }

    function rolloverLoan(
        RolloverContractParams calldata contracts,
        uint256 loanId,
        LoanLibrary.LoanTerms calldata newLoanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        LoanLibrary.LoanData memory loanData = contracts.loanCore.getLoan(loanId);
        _validateRollover(loanData, contracts.loanCore, contracts.targetLoanCore, newLoanTerms);

        uint256 amountDue = loanData.terms.principal + loanData.terms.interest;
        uint256 startBalance = IERC20(loanData.terms.payableCurrency).balanceOf(address(this));

        {
            address[] memory assets = new address[](1);
            assets[0] = loanData.terms.payableCurrency;

            uint256[] memory amounts = new uint256[](1);
            amounts[0] = amountDue;

            uint256[] memory modes = new uint256[](1);
            modes[0] = 0;

            OperationData memory opData = OperationData({
                contracts: contracts,
                loanId: loanId,
                newLoanTerms: newLoanTerms,
                v: v,
                r: r,
                s: s
            });

            bytes memory params = abi.encode(opData);

            // Flash loan based on principal + interest
            LENDING_POOL.flashLoan(address(this), assets, amounts, modes, address(this), params, 0);
        }

        // Should not have any funds leftover
        require(
            IERC20(loanData.terms.payableCurrency).balanceOf(address(this)) == startBalance,
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
        OperationContracts memory opContracts = _getContracts(opData.contracts);

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
            require(
                IERC20(assets[0]).allowance(borrower, address(this)) >= needFromBorrower,
                "Need borrower to approve balance"
            );
        }

        _repayLoan(opContracts, loanData);
        uint256 newLoanId = _initializeNewLoan(opContracts, borrower, lender, loanData.terms.collateralTokenId, opData);

        if (leftoverPrincipal > 0) {
            IERC20(assets[0]).safeTransfer(borrower, leftoverPrincipal);
        } else if (needFromBorrower > 0) {
            IERC20(assets[0]).safeTransferFrom(borrower, address(this), needFromBorrower);
        }

        // Approve all amounts for flash loan repayment
        IERC20(assets[0]).approve(address(LENDING_POOL), flashAmountDue);

        emit Rollover(lender, borrower, loanData.terms.collateralTokenId, newLoanId);

        if (address(opData.contracts.loanCore) != address(opData.contracts.targetLoanCore)) {
            emit Migration(address(opContracts.loanCore), address(opContracts.targetLoanCore), newLoanId);
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

        require(leftoverPrincipal == 0 || needFromBorrower == 0, "_ensureFunds computation");
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

        LoanLibrary.LoanData memory newLoanData = contracts.targetLoanCore.getLoan(newLoanId);
        contracts.targetBorrowerNote.safeTransferFrom(address(this), borrower, newLoanData.borrowerNoteId);

        return newLoanId;
    }

    function _getContracts(RolloverContractParams memory contracts) internal returns (OperationContracts memory) {
        return
            OperationContracts({
                loanCore: contracts.loanCore,
                borrowerNote: contracts.loanCore.borrowerNote(),
                lenderNote: contracts.loanCore.lenderNote(),
                feeController: contracts.targetLoanCore.feeController(),
                assetWrapper: contracts.loanCore.collateralToken(),
                repaymentController: contracts.repaymentController,
                originationController: contracts.originationController,
                targetLoanCore: contracts.targetLoanCore,
                targetBorrowerNote: contracts.targetLoanCore.borrowerNote()
            });
    }

    function _validateRollover(
        LoanLibrary.LoanData memory loanData,
        ILoanCore loanCore,
        ILoanCore targetLoanCore,
        LoanLibrary.LoanTerms calldata newLoanTerms
    ) internal {
        uint256 borrowerNoteId = loanData.borrowerNoteId;

        IERC721 borrowerNote = loanCore.borrowerNote();
        address borrower = borrowerNote.ownerOf(borrowerNoteId);
        require(borrower == msg.sender, "Rollover: borrower only");

        LoanLibrary.LoanTerms memory terms = loanData.terms;

        require(newLoanTerms.payableCurrency == terms.payableCurrency, "Currency mismatch");
        require(newLoanTerms.collateralTokenId == terms.collateralTokenId, "Collateral mismatch");
        require(
            address(loanCore.collateralToken()) == address(targetLoanCore.collateralToken()),
            "Non-compatible AssetWrapper"
        );
    }
}
