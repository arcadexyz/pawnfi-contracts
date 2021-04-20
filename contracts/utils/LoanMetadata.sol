// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library LoanMetadata {
    enum Status {
        OPEN,
        REPAID,
        DEFAULT,
        CLAIMED
    }
}