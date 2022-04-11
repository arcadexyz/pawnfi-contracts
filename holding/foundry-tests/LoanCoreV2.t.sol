pragma solidity ^0.8.0;
import "ds-test/test.sol";
import "../interfaces/ILoanCoreV2.sol";
import "./interfaces/HEVM.sol";

import "../../contracts/LoanCoreV2.sol";
import "../test/MockERC20.sol";
import "forge-std/Vm.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract Receiver is IERC721Receiver {
    function onERC721Received(
        address operator,
        address from,
        uint256 id,
        bytes calldata data
    ) external returns (bytes4){
        return this.onERC721Received.selector;
    }
}

contract LoanCoreV2Test is DSTest, Receiver {

    MockERC20[] tokens;

    LoanCoreV2 public loanCoreV2;
    MockERC20 public mockToken;

    Vm vm = Vm(HEVM_ADDRESS);

    function setUp() public {
        mockToken = new MockERC20("TestToken","TT");

        address token0 = address(new MockERC20("TestToken1","TT1"));
        address token1 = address(new MockERC20("TestToken2","TT2"));
        tokens.push(MockERC20(token0));
        tokens.push(MockERC20(token1));
        vm.label(address(tokens[0]),"token 0 ");
        vm.label(address(tokens[1]),"token 1 ");
    }

    function testMint(uint256 amount) public {
        mockToken.mint(address(this), amount);
        assert(mockToken.balanceOf(address(this)) == amount);
    }

    function InitializeLoan() public {

    }

}
