// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "./libraries/LoanData.sol";
import "./interfaces/INote.sol";
import "./interfaces/ILoanCore.sol";
import "./interfaces/IRepaymentController.sol";

contract RepaymentController is IRepaymentController {
    ILoanCore private loanCore;
    INote private borrowerNote;
    INote private lenderNote;
    
    constructor(
        ILoanCore _loanCore,
        INote _borrowerNote,
        INote _lenderNote
    ) {
        require(_loanCore != address(0), "loanCore address must be defined");

        bytes4 loanCoreInterface = type(ILoanCore).interfaceId;
        require(IERC165(_loanCore).supportsInterface(loanCoreInterface), "loanCore must be an instance of LoanCore");

        loanCore = ILoanCore(_loanCore);

        borrowerNote = _borrowerNote;
        lenderNote = _lenderNote;
    }

    function repay(uint256 borrowerNoteId) external override {
        // get loan from borrower note
        // withdraw principal plus interest from borrower and send to loan core
        // call repay function in loan core
    }
}