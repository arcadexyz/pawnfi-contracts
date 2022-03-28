// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./external/interfaces/ILendingPool.sol";

import "./interfaces/IFlashRollover.sol";
import "./interfaces/ILoanCoreV2.sol";
import "./interfaces/IOriginationController.sol";
import "./interfaces/IRepaymentControllerV2.sol";
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
contract FlashRollover is IFlashRollover, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* solhint-disable var-name-mixedcase */
    // AAVE Contracts
    // Variable names are in upper case to fulfill IFlashLoanReceiver interface
    ILendingPoolAddressesProvider public immutable override ADDRESSES_PROVIDER;
    ILendingPool public immutable override LENDING_POOL;

    //interest rate parameters
    uint256 public constant INTEREST_DENOMINATOR = 1*10**18;
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10000;

    /* solhint-enable var-name-mixedcase */

    address private owner;

    constructor(ILendingPoolAddressesProvider _addressesProvider) {
        ADDRESSES_PROVIDER = _addressesProvider;
        LENDING_POOL = ILendingPool(_addressesProvider.getLendingPool());

        owner = msg.sender;
    }

    function rolloverLoan(
        RolloverContractParams calldata contracts,
        uint256 loanId,
        LoanLibraryV2.LoanTerms calldata newLoanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        ILoanCoreV2 sourceLoanCoreV2 = contracts.sourceLoanCoreV2;
        LoanLibraryV2.LoanData memory loanData = sourceLoanCoreV2.getLoan(loanId);
        LoanLibraryV2.LoanTerms memory loanTerms = loanData.terms;

        _validateRollover(sourceLoanCoreV2, contracts.sourceLoanCoreV2, loanTerms, newLoanTerms, loanData.borrowerNoteId);

        {
            address[] memory assets = new address[](1);
            assets[0] = loanTerms.payableCurrency;

            uint256[] memory amounts = new uint256[](1);
            amounts[0] = loanTerms.principal +
                ((loanTerms.principal * (loanTerms.interest / INTEREST_DENOMINATOR))/BASIS_POINTS_DENOMINATOR);

            uint256[] memory modes = new uint256[](1);
            modes[0] = 0;

            bytes memory params = abi.encode(
                OperationData({ contracts: contracts, loanId: loanId, newLoanTerms: newLoanTerms, v: v, r: r, s: s })
            );

            // Flash loan based on principal + interest
            LENDING_POOL.flashLoan(address(this), assets, amounts, modes, address(this), params, 0);
        }

        // Should not have any funds leftover
        require(IERC20(loanTerms.payableCurrency).balanceOf(address(this)) == 0, "leftover balance");
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override nonReentrant returns (bool) {
        require(msg.sender == address(LENDING_POOL), "unknown callback sender");
        require(initiator == address(this), "not initiator");

        return _executeOperation(assets, amounts, premiums, abi.decode(params, (OperationData)));
    }

    function _executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        OperationData memory opData
    ) internal returns (bool) {
        OperationContracts memory opContracts = _getContracts(opData.contracts);

        // Get loan details
        LoanLibraryV2.LoanData memory loanData = opContracts.loanCoreV2.getLoan(opData.loanId);

        address borrower = opContracts.borrowerNote.ownerOf(loanData.borrowerNoteId);
        address lender = opContracts.lenderNote.ownerOf(loanData.lenderNoteId);

        // Do accounting to figure out amount each party needs to receive
        (uint256 flashAmountDue, uint256 needFromBorrower, uint256 leftoverPrincipal) = _ensureFunds(
            amounts[0],
            premiums[0],
            opContracts.feeController.getOriginationFee(),
            opData.newLoanTerms.principal
        );

        IERC20 asset = IERC20(assets[0]);

        if (needFromBorrower > 0) {
            require(asset.balanceOf(borrower) >= needFromBorrower, "borrower cannot pay");
            require(asset.allowance(borrower, address(this)) >= needFromBorrower, "lacks borrower approval");
        }

        _repayLoan(opContracts, loanData, borrower);
        uint256 newLoanId = _initializeNewLoan(opContracts, borrower, lender, loanData.terms.collateralTokenId, opData);

        if (leftoverPrincipal > 0) {
            asset.safeTransfer(borrower, leftoverPrincipal);
        } else if (needFromBorrower > 0) {
            asset.safeTransferFrom(borrower, address(this), needFromBorrower);
        }

        // Approve all amounts for flash loan repayment
        asset.approve(address(LENDING_POOL), flashAmountDue);

        emit Rollover(lender, borrower, loanData.terms.collateralTokenId, newLoanId);

        if (address(opData.contracts.sourceLoanCoreV2) != address(opData.contracts.targetLoanCoreV2)) {
            emit Migration(address(opContracts.loanCoreV2), address(opContracts.targetLoanCoreV2), newLoanId);
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
        require(leftoverPrincipal == 0 || needFromBorrower == 0, "funds conflict");
    }

    function _repayLoan(
        OperationContracts memory contracts,
        LoanLibraryV2.LoanData memory loanData,
        address borrower
    ) internal {
        // Take BorrowerNote from borrower
        // Must be approved for withdrawal
        contracts.borrowerNote.transferFrom(borrower, address(this), loanData.borrowerNoteId);

        // Approve repayment
        IERC20(loanData.terms.payableCurrency).approve(
            address(contracts.repaymentControllerV2),
            loanData.terms.principal + loanData.terms.interest
        );

        // Repay loan
        contracts.repaymentControllerV2.repay(loanData.borrowerNoteId);

        // contract now has asset wrapper but has lost funds
        require(
            contracts.assetWrapper.ownerOf(loanData.terms.collateralTokenId) == address(this),
            "collateral ownership"
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

        LoanLibraryV2.LoanData memory newLoanData = contracts.loanCoreV2.getLoan(newLoanId);
        contracts.targetBorrowerNote.safeTransferFrom(address(this), borrower, newLoanData.borrowerNoteId);

        return newLoanId;
    }

    function _getContracts(RolloverContractParams memory contracts) internal returns (OperationContracts memory) {
        return
            OperationContracts({
                loanCoreV2: contracts.sourceLoanCoreV2,
                borrowerNote: contracts.sourceLoanCoreV2.borrowerNote(),
                lenderNote: contracts.sourceLoanCoreV2.lenderNote(),
                feeController: contracts.sourceLoanCoreV2.feeController(),
                assetWrapper: contracts.sourceLoanCoreV2.collateralToken(),
                repaymentControllerV2: contracts.sourceRepaymentControllerV2,
                originationController: contracts.targetOriginationController,
                targetLoanCoreV2: contracts.targetLoanCoreV2,
                targetBorrowerNote: contracts.targetLoanCoreV2.borrowerNote()
            });
    }

    function _validateRollover(
        ILoanCoreV2 sourceLoanCoreV2,
        ILoanCoreV2 targetLoanCoreV2,
        LoanLibraryV2.LoanTerms memory sourceLoanTerms,
        LoanLibraryV2.LoanTerms calldata newLoanTerms,
        uint256 borrowerNoteId
    ) internal {
        require(sourceLoanCoreV2.borrowerNote().ownerOf(borrowerNoteId) == msg.sender, "caller not borrower");

        require(newLoanTerms.payableCurrency == sourceLoanTerms.payableCurrency, "currency mismatch");

        require(newLoanTerms.collateralTokenId == sourceLoanTerms.collateralTokenId, "collateral mismatch");

        require(
            address(sourceLoanCoreV2.collateralToken()) == address(sourceLoanCoreV2.collateralToken()),
            "non-compatible AssetWrapper"
        );
    }

    function setOwner(address _owner) external override {
        require(msg.sender == owner, "not owner");

        owner = _owner;

        emit SetOwner(owner);
    }

    function flushToken(IERC20 token, address to) external override {
        require(msg.sender == owner, "not owner");

        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "no balance");

        token.transfer(to, balance);
    }
}
