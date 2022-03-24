// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// V2 Notes
// * interest input as a APR value.

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./libraries/LoanLibraryV2.sol";
import "./interfaces/IPromissoryNote.sol";
import "./interfaces/ILoanCoreV2.sol";
import "./interfaces/IRepaymentControllerV2.sol";

// * * * * testing only * * * *
import "./test/MockERC20.sol";
import "hardhat/console.sol";

contract RepaymentControllerV2 is IRepaymentControllerV2 {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    ILoanCoreV2 private loanCoreV2;
    IPromissoryNote private borrowerNote;
    IPromissoryNote private lenderNote;

    //interest rate parameters
    uint256 public constant INTEREST_DENOMINATOR = 1*10**18;
    uint256 public constant BASIS_POINTS_DENOMINATOR = 10000;

    constructor(
        ILoanCoreV2 _loanCoreV2,
        IPromissoryNote _borrowerNote,
        IPromissoryNote _lenderNote
    ) {
        loanCoreV2 = _loanCoreV2;
        borrowerNote = _borrowerNote;
        lenderNote = _lenderNote;
    }

    //interest and principal must be entered as base 10**18
    function getInterestNoInstallments(uint256 principal, uint256 interest, address collateralTokenAddr) internal returns(uint256) {
        //interest to be greater than or equal to 1 ETH
        require(interest / 10**18 >= 1, "Interest must be greater than 0.01%.");
        console.log("Interest Amount: ", ((principal * (interest / INTEREST_DENOMINATOR))/BASIS_POINTS_DENOMINATOR));

        //principal must be greater than 10000 wei this is a rquire statement in createLoan function in LoanCoreV2
        console.log("Principal+interest", principal + ((principal * (interest / INTEREST_DENOMINATOR))/BASIS_POINTS_DENOMINATOR));
        uint256 total = principal + ((principal * (interest / INTEREST_DENOMINATOR))/BASIS_POINTS_DENOMINATOR);
        return total;
    }

    /**
     * @inheritdoc IRepaymentControllerV2
     */
    function repay(uint256 borrowerNoteId) external override {
        // get loan from borrower note
        uint256 loanId = borrowerNote.loanIdByNoteId(borrowerNoteId);

        require(loanId != 0, "RepaymentController: repay could not dereference loan");

        LoanLibraryV2.LoanTerms memory terms = loanCoreV2.getLoan(loanId).terms;

        // withdraw principal plus interest from borrower and send to loan core
        uint256 total = getInterestNoInstallments(terms.principal, terms.interest, terms.payableCurrency);
        require( total > 0, "No payment due." );

        IERC20(terms.payableCurrency).safeTransferFrom(
            msg.sender,
            address(this),
            total
        );
        IERC20(terms.payableCurrency).approve(address(loanCoreV2), total);

        // call repay function in loan core
        loanCoreV2.repay(loanId);
    }

    /**
     * @inheritdoc IRepaymentControllerV2
     */
    function claim(uint256 lenderNoteId) external override {
        // make sure that caller owns lender note
        address lender = lenderNote.ownerOf(lenderNoteId);
        require(lender == msg.sender, "RepaymentController: not owner of lender note");

        // get loan from lender note
        uint256 loanId = lenderNote.loanIdByNoteId(lenderNoteId);
        require(loanId != 0, "RepaymentController: claim could not dereference loan");

        // call claim function in loan core
        loanCoreV2.claim(loanId);
    }
}
