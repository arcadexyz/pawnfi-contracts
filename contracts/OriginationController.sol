pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./interfaces/IOriginationController.sol";
import "./interfaces/ILoanCore.sol";
import "./interfaces/IERC721Permit.sol";

/**
 * @dev
 *
 * This contract uses {AccessControl} to lock permissioned functions using the
 * different roles - head to its documentation for details.
 *
 */
contract OriginationController is Context, AccessControlEnumerable, IOriginationController {
    uint256 public loanId;
    address public loanCore;
    address public assetWrapper;
    using ECDSA for bytes32;

    /**
     * @dev
     * Grants `DEFAULT_ADMIN_ROLE` to the account that deploys the contract. Admins
     * can pause the contract if needed.
     *
     */
    constructor(address _loanCore, address _assetWrapper) {
        require(_loanCore != address(0), "loanCore address must be defined");
        loanCore = _loanCore;
        assetWrapper = _assetWrapper;
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /**
     * @dev initializes loan from loan core
     *
     * Requirements:
     *
     * - The caller must be a borrower or lender.
     * - The external signer must not be msg.sender
     * - The external signer must be a borrower or lender
     *
     *
     */
    function initializeLoan(
        LoanData.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        require(msg.sender == lender || msg.sender == borrower, "msg.sender must be lender or borrower");

        bytes32 _loanTerms =
            keccak256(
                abi.encodePacked(
                    loanTerms.dueDate,
                    loanTerms.principal,
                    loanTerms.interest,
                    loanTerms.payableCurrency,
                    loanTerms.collateralTokenId
                )
            );

        address externalSigner = _loanTerms.toEthSignedMessageHash().recover(v, r, s);

        require(externalSigner == lender || externalSigner == borrower, "external signer must be borrower or lender");

        require(
            IERC721(lender).getApproved(loanTerms.collateralTokenId) != address(0),
            "must be approved to accept collateral token"
        );

        require(
            IERC20(loanTerms.payableCurrency).allowance(address(lender), address(this)) > 0,
            "must be approved to accept funding currency"
        );

        TransferHelper.safeTransferFrom(loanTerms.payableCurrency, lender, borrower, loanTerms.principal);
        IERC721(address(this)).transferFrom(borrower, loanCore, loanTerms.collateralTokenId);

        ILoanCore(loanCore).createLoan(loanTerms);
        ILoanCore(loanCore).startLoan(lender, borrower, loanId);
    }

    /**
     * @dev initializes loan from loan core with Collateral Permit
     *
     **/
    function initializeLoanWithCollateralPermit(
        LoanData.LoanTerms calldata loanTerms,
        address borrower,
        address lender,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint8 collateralV,
        bytes32 collateralR,
        bytes32 collateralS
    ) external override {

        IERC721Permit(assetWrapper).permit(
            borrower,
            address(this),
            loanTerms.collateralTokenId,
            block.timestamp+1000,
            collateralV,
            collateralR,
            collateralS
        );

        this.initializeLoan(loanTerms, borrower, lender, v, r, s);
    }
}
