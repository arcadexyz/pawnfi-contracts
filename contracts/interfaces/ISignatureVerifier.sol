// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../libraries/LoanLibrary.sol";

interface IArcadeSignatureVerifier {
    function recoverBundleSignature(
        LoanLibrary.LoanTerms calldata loanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external view returns (address signer);

    function recoverItemsSignature(
        LoanLibrary.LoanTerms calldata loanTerms,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes calldata items
    ) external view returns (address signer);

    function verifyItems(
        bytes calldata itemsPacked,
        address vault
    ) external view returns (bool);
}
