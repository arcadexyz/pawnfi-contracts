pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

/**
 * Fee Controller is intended to be an upgradable component of Pawnfi
 * where new fees can be added or modified based on different user attributes
 *
 * Type/size of loan being requested
 * Amount of tokens being staked, etc
 *
 * Version 1 (as of 4/21/2021) Capabilities:
 *
 * FeeController will be called once after a loan has been matched so that we can
 * create an origination fee (2% credited to PawnFi)
 * @dev support for floating point originationFee should be discussed
 */

contract FeeController is AccessControlEnumerable {
    /** @dev Returns the type of fee given business logic of PawnFi
    
    E.g. Random user's loan request for 2 wETH is matched with a lender
    Function is called to determine origination fee (predetermined 2% of total loan value) 
    and fee, in terms of the base currency of the loan, is returned 

    * Requirements: 

    * - type must be a valid type supported by contract 
    * - amount for loan must be greater than 0 
    * - address must be a valid ERC20  contract implementing balanceOf

    */
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    constructor() {
        _setupRole(ADMIN_ROLE, _msgSender());
    }

    function setOriginationFee() public view returns (uint256) {
        require(hasRole(ADMIN_ROLE, _msgSender()), "FeeController: callers is not approved to set ");

        return 2;
    }

    function getOriginationFee(uint256 loanAmount) public view returns (uint256) {
        return (loanAmount / 100) * setOriginationFee();
    }
}
