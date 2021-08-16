// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interfaces/IPromissoryNote.sol";
import "./interfaces/IAssetWrapper.sol";
import "./interfaces/IFeeController.sol";
import "./interfaces/ILoanCore.sol";

import "./PromissoryNote.sol";

/**
 * @dev LoanCore contract - core contract for creating, repaying, and claiming collateral for PawnFi loans
 */
contract LoanCore is ILoanCore, AccessControl, Pausable {
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    bytes32 public constant ORIGINATOR_ROLE = keccak256("ORIGINATOR_ROLE");
    bytes32 public constant REPAYER_ROLE = keccak256("REPAYER_ROLE");
    bytes32 public constant FEE_CLAIMER_ROLE = keccak256("FEE_CLAIMER_ROLE");

    Counters.Counter private loanIdTracker;
    mapping(uint256 => LoanLibrary.LoanData) private loans;
    mapping(uint256 => bool) private collateralInUse;
    IPromissoryNote public borrowerNote;
    IPromissoryNote public lenderNote;
    IERC721 public collateralToken;
    IFeeController public feeController;
    address public originationController;
    address public repaymentController;

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

        emit Initialized(address(collateralToken), address(borrowerNote), address(lenderNote));
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
        SafeERC20.safeTransferFrom(
            IERC20(data.terms.payableCurrency),
            _msgSender(),
            address(this),
            data.terms.principal
        );

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
        SafeERC20.safeTransfer(
            IERC20(data.terms.payableCurrency),
            borrower,
            getPrincipalLessFees(data.terms.principal)
        );
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
        SafeERC20.safeTransferFrom(IERC20(data.terms.payableCurrency), _msgSender(), address(this), returnAmount);

        address lender = lenderNote.ownerOf(data.lenderNoteId);
        address borrower = borrowerNote.ownerOf(data.borrowerNoteId);

        // state changes and cleanup
        // NOTE: these must be performed before assets are released to prevent reentrance
        loans[loanId].state = LoanLibrary.LoanState.Repaid;
        lenderNote.burn(data.lenderNoteId);
        borrowerNote.burn(data.borrowerNoteId);

        // asset and collateral redistribution
        SafeERC20.safeTransfer(IERC20(data.terms.payableCurrency), lender, returnAmount);
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
        SafeERC20.safeTransfer(token, _msgSender(), amount);
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
}
