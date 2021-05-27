// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./interfaces/INote.sol";
import "./interfaces/IAssetWrapper.sol";
import "./interfaces/ILoanCore.sol";

/**
 * TODO:
 * Add onlyOriginationController
 * Add onlyRepaymentController
 * Fetch fees from FeeController
 * Add admin permissions to update origination controller, repayment controller
 * Add fee collection mechanism
 */

/**
 * @dev Interface for the LoanCore contract
 */
contract LoanCore is ILoanCore {
    using Counters for Counters.Counter;
    Counters.Counter private loanIdTracker;
    using SafeMath for uint256;

    mapping(uint256 => LoanData) private loans;
    mapping(uint256 => bool) private collateralInUse;
    INote private borrowerNote;
    INote private lenderNote;
    IERC721 private collateralToken;

    // TODO: fetch this from fee controller when available
    uint256 private constant PROTOCOL_FEE_BPS = 300;
    uint256 private constant BPS_DENOMINATOR = 10000;

    mapping(address => uint256) private tokenBalances;

    constructor(
        INote _borrowerNote,
        INote _lenderNote,
        IERC721 _collateralToken
    ) {
        borrowerNote = _borrowerNote;
        lenderNote = _lenderNote;
        collateralToken = _collateralToken;
    }

    /**
     * @inheritdoc ILoanCore
     */
    function getLoan(uint256 loanId) external view override returns (LoanData memory loanData) {
        return loans[loanId];
    }

    /**
     * @inheritdoc ILoanCore
     */
    function createLoan(LoanTerms calldata terms) external override returns (uint256 loanId) {
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

        loans[loanId] = LoanData(0, 0, terms, LoanState.Created);
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
    ) external override {
        LoanData memory data = loans[loanId];
        // Ensure valid initial loan state
        require(data.state == LoanState.Created, "LoanCore::start: Invalid loan state");
        // Ensure collateral and principal were deposited
        require(
            collateralToken.ownerOf(data.terms.collateralTokenId) == address(this),
            "LoanCore::start: collateral not sent"
        );
        uint256 received = tokensReceived(IERC20(data.terms.payableCurrency));
        require(received >= data.terms.principal, "LoanCore::start: Insufficient lender deposit");

        // Distribute notes and principal
        loans[loanId].state = LoanState.Active;
        uint256 borrowerNoteId = borrowerNote.mint(borrower);
        uint256 lenderNoteId = lenderNote.mint(lender);

        // TODO: test if this is more/less costly than just setting the fields
        loans[loanId] = LoanData(borrowerNoteId, lenderNoteId, data.terms, LoanState.Active);
        IERC20(data.terms.payableCurrency).transfer(borrower, getPrincipalLessFees(data.terms.principal));

        updateTokenBalance(IERC20(data.terms.payableCurrency));
        emit LoanStarted(loanId, lender, borrower);
    }

    /**
     * @inheritdoc ILoanCore
     */
    function repay(uint256 loanId) external override {
        LoanData memory data = loans[loanId];
        // Ensure valid initial loan state
        require(data.state == LoanState.Active, "LoanCore::repay: Invalid loan state");
        // NOTE: maybe we should remove this line, i.e. allow repayment of expired loan
        require(data.terms.dueDate > block.timestamp, "LoanCore::repay: Loan expired");

        // ensure repayment was valid
        uint256 returnAmount = data.terms.principal.add(data.terms.interest);
        uint256 received = tokensReceived(IERC20(data.terms.payableCurrency));
        require(received >= returnAmount, "LoanCore::repay: Insufficient repayment");

        address lender = lenderNote.ownerOf(data.lenderNoteId);
        address borrower = borrowerNote.ownerOf(data.borrowerNoteId);

        // state changes and cleanup
        // NOTE: these must be performed before assets are released to prevent reentrance
        loans[loanId].state = LoanState.Repaid;
        lenderNote.burn(data.lenderNoteId);
        borrowerNote.burn(data.borrowerNoteId);

        // asset and collateral redistribution
        IERC20(data.terms.payableCurrency).transfer(lender, returnAmount);
        collateralToken.transferFrom(address(this), borrower, data.terms.collateralTokenId);

        updateTokenBalance(IERC20(data.terms.payableCurrency));

        emit LoanRepaid(loanId);
    }

    /**
     * @inheritdoc ILoanCore
     */
    function claim(uint256 loanId) external override {
        LoanData memory data = loans[loanId];
        // Ensure valid initial loan state
        require(data.state == LoanState.Active, "LoanCore::claim: Invalid loan state");
        require(data.terms.dueDate < block.timestamp, "LoanCore::claim: Loan not expired");

        address lender = lenderNote.ownerOf(data.lenderNoteId);

        // NOTE: these must be performed before assets are released to prevent reentrance
        loans[loanId].state = LoanState.Defaulted;
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
    function getPrincipalLessFees(uint256 principal) internal pure returns (uint256) {
        // TODO: Fetch protocol fee from the fee controller
        return principal.sub(principal.mul(PROTOCOL_FEE_BPS).div(BPS_DENOMINATOR));
    }
}
