pragma solidity ^0.8.0;

import "../utils/LoanMetadata.sol";

contract MockLoanCore {
    address public address;
    address public borrowerAddress;
    address public lenderAddress;
    LoanMetadata.Loan public activeLoan;
    mapping(uint256 => LoanMetadata.Loan) public activeLoans;

    constructor(address _borrowerAddress, address _lenderAddress) {
        uint256 nonce = 1000;
        borrowerAddress = _borrowerAddress;
        lenderAddress = _lenderAddress;
        address = address(uint160(uint256(keccak256(abi.encodePacked(nonce, blockhash(block.number))))));
    }

    function getLoanCoreAddres() public returns (address) {
        return loanCoreAddress;
    }

    function createLoan(uint256 tokenId) public {
        LoanMetadata.Terms memory loanTerms = LoanMetadata.Terms(345, 100, borrowerAddress, 12, lenderAddress);

        LoanMetadata.Loan memory _activeLoan =
            LoanMetadata.Loan(LoanMetadata.Status.OPEN, loanTerms, lenderAddress, tokenId, borrowerAddress, tokenId);

        activeLoans[tokenId] = _activeLoan;
    }

    function destroyLoan(uint256 tokenId) public {
        delete activeLoans[tokenId];
    }

    function getLoanByLenderNote(uint256 tokenId) external view returns (LoanMetadata.Loan memory loan) {
        return activeLoans[tokenId];
    }
}
