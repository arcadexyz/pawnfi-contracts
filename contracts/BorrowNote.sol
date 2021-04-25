pragma solidity ^0.8.0 

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./utils/LoanMetadata.sol";
import "./interfaces/ILoanCore.sol";

library LoanStatus {

    enum Status = {"Open", "Repaid", "Default"};

}

/**
Borrower note is intended to be an upgradable 

**@dev

*/
contract BorrowerNote is Context, AccessControlEnumerable, ERC721, ERC721Enumerable, ERC721Pausable { 

    using LoanStatus for Status;
    using LoanMetadata for *;

    bytes32 public constant LOAN_CORE_ROLE = keccak256("LOAN_CORE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    Counters.Counter private _tokenIdTracker;
    address public loanCore;

    /**
    *@dev Creates the borrowor note contract linked to a specific loan core 
    * The loan core reference is non-upgradeable 
    * See (_setURI).
    */

    constructor(string memory name, string memory symbol, address loanCore_) ERC721(uri) {

        require(loanCore_ != address(0), "loanCore address must be defined");
        
        bytes4 loanCoarInterface = type(ILoanCore).interfaceId;
        
        require(IERC165(loanCore_).supportsInterface(loanCoreInterface), "loanCore must be an instance of LoanCore");
        
        _setupRole(LOAN_CORE_ROLE, loanCore_);
        loanCore = loanCore_;

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _setupRole(PAUSER_ROLE, _msgSender());

    }

    function mint(
        uint256 account,
        uint256 noteId,
        address assetWrapper

    ) external {

    require(hasRole(MINTER_ROLE, _mesSender()), "ERC721PresetMinter:")
    _mint(to, _tokenIdTracker.current());
    _assetWrappers[_tokenIdTracker] = assetWrapper;
    _tokenIdTracker.increment();

    require(
        IAssetWrapper(assetWrapper).supportInterface(type(IAssetWrapper)),
        "assetWrapper must support AssetWrapper interface"
    );

    
    /*

    Add business logic to mint token here

    */

    }

    function burn(uint256 tokenId){

        if (hasRole(LOAN_CORE_ROLE, _msgSender())){

            require(!this.isActive(tokenId), "BorrowerNote: LoanCore attempted to burn an active note.");
            
        } else { 

            require(_isApproveOrOwner(_msgSender(), tokenId), "BorrowerNote: callers is not owner nor approved");

        }

        _burn(tokenId);

    }

    function repay(
        uint256 account,
        uint256 loadId,
        address assetWrapper) returns(bool) {

        address repaymentController = ILoanCore(loanCore).getRepaymentController();
        uint256 balance = repaymentContoller.balance; //CHECK TO SEE IF THIS IS CORRECT
        require(balance > 0, "Balance must be greater than 0");

        string fundingCurrency = ILoanCore(loanCore).getLoanByBorrowerNote.fundingCurrency;

        if (fundingCurrency == keccak256("ETH")) {

            //Send ETH

        } else if (fundingCurrency == keccak256("ERC20")) {

            //SEND ERC20
        }

    }

    function checkStatus(uint256 tokenId) external view returns (Status){
      
        require(_exists(tokenId), "BorrowerNote: loan does not exist");

        return ILoanCore(loanCore).getLoanByBorrowerNote(tokenId).status;

    }

    function checkTerms(uint256 tokenId) external view returns (Status){

        require(_exists(tokenId), "BorrowerNote: loan does not exist");

        return ILoanCore(loanCore).getLoanByBorrowerNote(tokenId).terms;

    }

    function isActive(uint256 tokenId) public view returns (bool) {

        require(_exists(tokenId), "BorrowerNote: loan does not exist");

        LoanMetadata.Status stats = ILoanCore(loanCore).getLoanByBorrowerNote(tokenId).status;

        return status == LoanMetadata.Status.OPEN || status == LoanMetadata.Status.DEFAULT;

    }

}