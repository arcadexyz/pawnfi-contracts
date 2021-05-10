/* eslint-disable */
// TODO: Remove the disable above.

import { expect } from "chai";
import hre from "hardhat";
import { BigNumber, Signer } from "ethers";

import { LenderNote } from "../typechain/LenderNote";

// TODO: Write tests once loanCore is more fleshed out.

describe("LenderNote", () => {
  describe("constructor", () => {
    it("Reverts if loanCore_ address is not provided", () => {});
    it("Reverts if loanCore_ address does not support loanCore interface", () => {});
    it("Creates a LenderNote", () => {});
  });
  describe("mint", () => {
    it("Reverts if sender is not loanCore", () => {});
    it("Assigns a LenderNote NFT to the recipient", () => {});
  });
  describe("burn", () => {
    it("Reverts if loanCore attempts to burn active note", () => {});
    it("Reverts if sender does not own the note", () => {});
    it("Burns a LenderNote NFT", () => {});
  });
  describe("transfer", () => {
    it("Reverts if note is inactive", () => {});
    it("Transfers ownership of the note", () => {});
  });
  describe("checkStatus", () => {
    it("Returns the status of the specified loan", () => {});
  });
  describe("checkTerms", () => {
    it("Returns the terms of the specified loan", () => {});
  });
  describe("isActive", () => {
    it("Returns a boolean specifying if the loan is active", () => {});
  });
});
