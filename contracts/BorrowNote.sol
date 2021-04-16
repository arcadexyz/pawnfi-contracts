pragma solidity ^0.8.0 

import "@openzeppelin/contracts/token/ERC1155/ERC155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC155Burnable.sol";

library LoanStatus {

    enum Status = {"Open", "Repaid", "Default"};

}

/**
Borrower note is intended to be an upgradable 

**@dev

*/
contract BorrowerNote is ERC1150Burnable { 

    using LoanStatus for Status;
    address public loanCore;
    /**
    *@dev Creates the borrowor note contract linked to a specific loan core 
    * The loan core reference is non-upgradeable 
    * See (_setURI).
    */

    constructor(string memory uri_, address loanCore_) ERC155(uri) {

        require(loanCore_ != address(0), "loanCore must be specified");

    }

    function mint(
        uint256 account,
        uint256 noteId,
        address assetWrapper

    ) external {

    require(hasRole(MINTER_ROLE, _mesSender()), "ERC721PresetMinter:")
    _mint(to, _tokenIdTracker.current());
    _assetWrappers[_tokenIdTracker] = assetWrapper;
    _tokeIdTracker.increment();

    require(
        IAssetWrapper(assetWrapper).supportInterface(type(IAssetWrapper)),
        "assetWrapper must support AssetWrapper interface"
    );

    
    /*

    Add business logic to mint token here

    */

    }


    function getRepaymentController() external view returns (address){

        return repaymentController;

    }

    function checkStatus(uint256 noteId) external view returns (Status){


    }

    function repay(
        uint256 account,
        uint256 loadId,
        address assetWrapper) returns(bool) {

        address repaymentController = ILoanCore(loanCore).getRepaymentController();
        IPaymentController(repaymentController).
        //getRepaymentController is both honest and correct

    }



}