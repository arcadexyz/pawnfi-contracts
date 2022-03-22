// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interfaces/ICallDelegator.sol";
import "./interfaces/IPromissoryNote.sol";
import "./interfaces/IAssetVault.sol";
import "./interfaces/IFeeController.sol";
import "./interfaces/ILoanCore.sol";

import "./PromissoryNote.sol";

/**
 * @dev LoanCore contract - core contract for creating, repaying, and claiming collateral for PawnFi loans
 */
contract LoanCore is ILoanCore, AccessControl, Pausable, ICallDelegator {
    using Counters for Counters.Counter;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    bytes32 public constant ORIGINATOR_ROLE = keccak256("ORIGINATOR_ROLE");
    bytes32 public constant REPAYER_ROLE = keccak256("REPAYER_ROLE");
    bytes32 public constant FEE_CLAIMER_ROLE = keccak256("FEE_CLAIMER_ROLE");

    Counters.Counter private loanIdTracker;
    mapping(uint256 => LoanLibrary.LoanData) private loans;
    mapping(uint256 => bool) private collateralInUse;
    IPromissoryNote public immutable override borrowerNote;
    IPromissoryNote public immutable override lenderNote;
    IERC721 public immutable override collateralToken;
    IFeeController public override feeController;

    // 10k bps per whole
    uint256 private constant BPS_DENOMINATOR = 10_000;

    constructor(IERC721 _collateralToken, IFeeController _feeController) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(FEE_CLAIMER_ROLE, _msgSender());
        // only those with FEE_CLAIMER_ROLE can update or grant FEE_CLAIMER_ROLE
        _setRoleAdmin(FEE_CLAIMER_ROLE, FEE_CLAIMER_ROLE);

        feeController = _feeController;
        collateralToken = _collateralToken;

        borrowerNote = new PromissoryNote("PawnFi Borrower Note", "pBN");
        lenderNote = new PromissoryNote("PawnFi Lender Note", "pLN");

        // Avoid having loanId = 0
        loanIdTracker.increment();
    }

    /**
     * @inheritdoc ILoanCore
     */
    function getLoan(uint256 loanId) external view override returns (LoanLibrary.LoanData memory loanData) {
        return loans[loanId];
    }

    /**
     * @inheritdoc ILoanCore
     */
    function createLoan(LoanLibrary.LoanTerms calldata terms)
        external
        override
        whenNotPaused
        onlyRole(ORIGINATOR_ROLE)
        returns (uint256 loanId)
    {
        require(terms.durationSecs > 0, "LoanCore::create: Loan is already expired");
        require(!collateralInUse[terms.collateralTokenId], "LoanCore::create: Collateral token already in use");

        loanId = loanIdTracker.current();
        loanIdTracker.increment();

        loans[loanId] = LoanLibrary.LoanData(
            0,
            0,
            terms,
            LoanLibrary.LoanState.Created,
            block.timestamp + terms.durationSecs
        );
        collateralInUse[terms.collateralTokenId] = true;
        emit LoanCreated(terms, loanId);
    }

    /**
     * @inheritdoc ILoanCore
     */
    function startLoan(
        address lender,
        address borrower,
        uint256 loanId
    ) external override whenNotPaused onlyRole(ORIGINATOR_ROLE) {
        LoanLibrary.LoanData memory data = loans[loanId];
        // Ensure valid initial loan state
        require(data.state == LoanLibrary.LoanState.Created, "LoanCore::start: Invalid loan state");
        // Pull collateral token and principal
        collateralToken.transferFrom(_msgSender(), address(this), data.terms.collateralTokenId);

        IERC20(data.terms.payableCurrency).safeTransferFrom(_msgSender(), address(this), data.terms.principal);

        // Distribute notes and principal
        loans[loanId].state = LoanLibrary.LoanState.Active;
        uint256 borrowerNoteId = borrowerNote.mint(borrower, loanId);
        uint256 lenderNoteId = lenderNote.mint(lender, loanId);

        loans[loanId] = LoanLibrary.LoanData(
            borrowerNoteId,
            lenderNoteId,
            data.terms,
            LoanLibrary.LoanState.Active,
            data.dueDate
        );

        IERC20(data.terms.payableCurrency).safeTransfer(borrower, getPrincipalLessFees(data.terms.principal));
        emit LoanStarted(loanId, lender, borrower);
    }

    /**
     * @inheritdoc ILoanCore
     */
    function repay(uint256 loanId) external override onlyRole(REPAYER_ROLE) {
        LoanLibrary.LoanData memory data = loans[loanId];
        // Ensure valid initial loan state
        require(data.state == LoanLibrary.LoanState.Active, "LoanCore::repay: Invalid loan state");

        // ensure repayment was valid
        uint256 returnAmount = data.terms.principal.add(data.terms.interest);
        IERC20(data.terms.payableCurrency).safeTransferFrom(_msgSender(), address(this), returnAmount);

        address lender = lenderNote.ownerOf(data.lenderNoteId);
        address borrower = borrowerNote.ownerOf(data.borrowerNoteId);

        // state changes and cleanup
        // NOTE: these must be performed before assets are released to prevent reentrance
        loans[loanId].state = LoanLibrary.LoanState.Repaid;
        collateralInUse[data.terms.collateralTokenId] = false;

        lenderNote.burn(data.lenderNoteId);
        borrowerNote.burn(data.borrowerNoteId);

        // asset and collateral redistribution
        IERC20(data.terms.payableCurrency).safeTransfer(lender, returnAmount);
        collateralToken.transferFrom(address(this), borrower, data.terms.collateralTokenId);

        emit LoanRepaid(loanId);
    }

    /**
     * @inheritdoc ILoanCore
     */
    function claim(uint256 loanId) external override whenNotPaused onlyRole(REPAYER_ROLE) {
        LoanLibrary.LoanData memory data = loans[loanId];

        // Ensure valid initial loan state
        require(data.state == LoanLibrary.LoanState.Active, "LoanCore::claim: Invalid loan state");
        require(data.dueDate < block.timestamp, "LoanCore::claim: Loan not expired");

        address lender = lenderNote.ownerOf(data.lenderNoteId);

        // NOTE: these must be performed before assets are released to prevent reentrance
        loans[loanId].state = LoanLibrary.LoanState.Defaulted;
        collateralInUse[data.terms.collateralTokenId] = false;

        lenderNote.burn(data.lenderNoteId);
        borrowerNote.burn(data.borrowerNoteId);

        // collateral redistribution
        collateralToken.transferFrom(address(this), lender, data.terms.collateralTokenId);

        emit LoanClaimed(loanId);
    }

    /**
     * Take a principal value and return the amount less protocol fees
     */
    function getPrincipalLessFees(uint256 principal) internal view returns (uint256) {
        return principal.sub(principal.mul(feeController.getOriginationFee()).div(BPS_DENOMINATOR));
    }

    // ADMIN FUNCTIONS

    /**
     * @dev Set the fee controller to a new value
     *
     * Requirements:
     *
     * - Must be called by the owner of this contract
     */
    function setFeeController(IFeeController _newController) external onlyRole(FEE_CLAIMER_ROLE) {
        feeController = _newController;
    }

    /**
     * @dev Claim the protocol fees for the given token
     *
     * @param token The address of the ERC20 token to claim fees for
     *
     * Requirements:
     *
     * - Must be called by the owner of this contract
     */
    function claimFees(IERC20 token) external onlyRole(FEE_CLAIMER_ROLE) {
        // any token balances remaining on this contract are fees owned by the protocol
        uint256 amount = token.balanceOf(address(this));
        token.safeTransfer(_msgSender(), amount);
        emit FeesClaimed(address(token), _msgSender(), amount);
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @inheritdoc ICallDelegator
     */
    function canCallOn(address caller, address vault) external view override returns (bool) {
        // if the collateral is not currently being used in a loan, disallow
        if (!collateralInUse[uint256(uint160(vault))]) {
            return false;
        }

        for (uint256 i = 0; i < borrowerNote.balanceOf(caller); i++) {
            uint256 borrowerNoteId = borrowerNote.tokenOfOwnerByIndex(caller, i);
            uint256 loanId = borrowerNote.loanIdByNoteId(borrowerNoteId);
            // if the borrower is currently borrowing against this vault,
            // return true
            if (loans[loanId].terms.collateralTokenId == uint256(uint160(vault))) {
                return true;
            }
        }

        return false;
    }
}
