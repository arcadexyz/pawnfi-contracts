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

    Counters.Counter private loanIdTracker;
    mapping(uint256 => LoanData.LoanData) private loans;
    mapping(uint256 => bool) private collateralInUse;
    IPromissoryNote public borrowerNote;
    IPromissoryNote public lenderNote;
    IERC721 public collateralToken;
    IFeeController public feeController;
    address public originationController;
    address public repaymentController;

    // 10k bps per whole
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // the last known balances by ERC20 token address
    mapping(address => uint256) private tokenBalances;

    constructor(IERC721 _collateralToken, IFeeController _feeController) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

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
    function getLoan(uint256 loanId) external view override returns (LoanData.LoanData memory loanData) {
        return loans[loanId];
    }

    /**
     * @inheritdoc ILoanCore
     */
    function createLoan(LoanData.LoanTerms calldata terms)
        external
        override
        whenNotPaused
        onlyRole(ORIGINATOR_ROLE)
        returns (uint256 loanId)
    {
        require(terms.dueDate > block.timestamp, "LoanCore::create: Loan is already expired");
        require(!collateralInUse[terms.collateralTokenId], "LoanCore::create: Collateral token already in use");

        // The following line could be removed to save gas
        // as it will be implicitly ensured in startLoan when we take ownership of the collateral
        require(
            collateralToken.ownerOf(terms.collateralTokenId) != address(0),
            "LoanCore::create: nonexistent collateral"
        );

        loanId = loanIdTracker.current();
        loanIdTracker.increment();

        loans[loanId] = LoanData.LoanData(0, 0, terms, LoanData.LoanState.Created);
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
        LoanData.LoanData memory data = loans[loanId];
        // Ensure valid initial loan state
        require(data.state == LoanData.LoanState.Created, "LoanCore::start: Invalid loan state");
        // Ensure collateral and principal were deposited
        require(
            collateralToken.ownerOf(data.terms.collateralTokenId) == address(this),
            "LoanCore::start: collateral not sent"
        );
        uint256 received = tokensReceived(IERC20(data.terms.payableCurrency));
        require(received >= data.terms.principal, "LoanCore::start: Insufficient lender deposit");

        // Distribute notes and principal
        loans[loanId].state = LoanData.LoanState.Active;
        uint256 borrowerNoteId = borrowerNote.mint(borrower, loanId);
        uint256 lenderNoteId = lenderNote.mint(lender, loanId);

        loans[loanId] = LoanData.LoanData(borrowerNoteId, lenderNoteId, data.terms, LoanData.LoanState.Active);
        SafeERC20.safeTransfer(
            IERC20(data.terms.payableCurrency),
            borrower,
            getPrincipalLessFees(data.terms.principal)
        );

        updateTokenBalance(IERC20(data.terms.payableCurrency));
        emit LoanStarted(loanId, lender, borrower);
    }

    /**
     * @inheritdoc ILoanCore
     */
    function repay(uint256 loanId) external override onlyRole(REPAYER_ROLE) {
        LoanData.LoanData memory data = loans[loanId];
        // Ensure valid initial loan state
        require(data.state == LoanData.LoanState.Active, "LoanCore::repay: Invalid loan state");

        // ensure repayment was valid
        uint256 returnAmount = data.terms.principal.add(data.terms.interest);
        uint256 received = tokensReceived(IERC20(data.terms.payableCurrency));
        require(received >= returnAmount, "LoanCore::repay: Insufficient repayment");

        address lender = lenderNote.ownerOf(data.lenderNoteId);
        address borrower = borrowerNote.ownerOf(data.borrowerNoteId);

        // state changes and cleanup
        // NOTE: these must be performed before assets are released to prevent reentrance
        loans[loanId].state = LoanData.LoanState.Repaid;
        lenderNote.burn(data.lenderNoteId);
        borrowerNote.burn(data.borrowerNoteId);

        // asset and collateral redistribution
        SafeERC20.safeTransfer(IERC20(data.terms.payableCurrency), lender, returnAmount);
        collateralToken.transferFrom(address(this), borrower, data.terms.collateralTokenId);

        updateTokenBalance(IERC20(data.terms.payableCurrency));

        emit LoanRepaid(loanId);
    }

    /**
     * @inheritdoc ILoanCore
     */
    function claim(uint256 loanId) external override whenNotPaused onlyRole(REPAYER_ROLE) {
        LoanData.LoanData memory data = loans[loanId];

        // Ensure valid initial loan state
        require(data.state == LoanData.LoanState.Active, "LoanCore::claim: Invalid loan state");
        require(data.terms.dueDate < block.timestamp, "LoanCore::claim: Loan not expired");

        address lender = lenderNote.ownerOf(data.lenderNoteId);

        // NOTE: these must be performed before assets are released to prevent reentrance
        loans[loanId].state = LoanData.LoanState.Defaulted;
        lenderNote.burn(data.lenderNoteId);
        borrowerNote.burn(data.borrowerNoteId);

        // collateral redistribution
        collateralToken.transferFrom(address(this), lender, data.terms.collateralTokenId);

        emit LoanClaimed(loanId);
    }

    /**
     * @dev Check the amount of tokens received for a given ERC20 token since last checked
     */
    function tokensReceived(IERC20 token) internal view returns (uint256 amount) {
        amount = token.balanceOf(address(this)).sub(tokenBalances[address(token)]);
    }

    /**
     * @dev Update the internal state of our token balance for the given token
     */
    function updateTokenBalance(IERC20 token) internal {
        tokenBalances[address(token)] = token.balanceOf(address(this));
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
    function setFeeController(IFeeController _newController) external onlyRole(DEFAULT_ADMIN_ROLE) {
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
    function claimFees(IERC20 token) external onlyRole(DEFAULT_ADMIN_ROLE) {
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
