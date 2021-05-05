pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "./utils/LoanNoteUtilities.sol";
import "./interfaces/ILoanCore.sol";

/**
Borrower note is intended to be an upgradable 

**@dev

*/
contract BorrowerNote is Context, AccessControlEnumerable, ERC721, ERC721Enumerable, ERC721Pausable {
    
    using Counters for Counters.Counter;

    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    Counters.Counter private _tokenIdTracker;
    address public loanCore;

    /**
     *@dev Creates the borrowor note contract linked to a specific loan core
     * The loan core reference is non-upgradeable
     * See (_setURI).
     */

    constructor(
        address loanCore_,        
        string memory name,
        string memory symbol) ERC721(name, symbol) {

        require(loanCore_ != address(0), "loanCore address must be defined");

        bytes4 loanCoreInterface = type(ILoanCore).interfaceId;

        require(IERC165(loanCore_).supportsInterface(loanCoreInterface), "loanCore must be an instance of LoanCore");

        _setupRole(BURNER_ROLE, loanCore_);

        loanCore = loanCore_;

        _setupRole(MINTER_ROLE, _msgSender());

        _setupRole(PAUSER_ROLE, _msgSender());
        
    }

    function mint(address to) external {
        require(hasRole(MINTER_ROLE, _msgSender()), "ERC721PresetMinter: ");
        _mint(to, _tokenIdTracker.current());
        _tokenIdTracker.increment();

        /*
        require(
            IAssetWrapper(assetWrapper).supportInterface(type(IAssetWrapper)),
            "assetWrapper must support AssetWrapper interface"
        );
        */

    }

    function burn(uint256 tokenId) external {

        if (hasRole(BURNER_ROLE, _msgSender())) {
            require(! ILoanCore.isActive(tokenId), "BorrowerNote: LoanCore attempted to burn an active note.");
            
        } else {
            require(_isApprovedOrOwner(_msgSender(), tokenId), "BorrowerNote: callers is not owner nor approved");
        }

        _burn(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) 
    public view virtual override(AccessControlEnumerable, ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount)
     internal virtual override(ERC721, ERC721Enumerable, ERC721Pausable) {
        
        super._beforeTokenTransfer(from, to, amount);

        require(! paused(), "ERC20Pausable: token transfer while paused");

    }

    
 
}
