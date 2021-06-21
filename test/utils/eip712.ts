import hre from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumberish, Wallet } from "ethers";
import { getMessage } from 'eip-712';
import * as ethers from 'ethers';
import { LoanTerms } from "./types";
import { fromRpcSig, ECDSASignature } from "ethereumjs-util";

interface TypeData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  types: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  primaryType: any;
}

export interface PermitData {
  owner: string;
  spender: string;
  tokenId: BigNumberish;
  nonce: number;
  deadline: BigNumberish;
}

export interface Eip712Data extends TypeData {
    domain: {
        name: string,
        version: string,
        chainId: number,
        verifyingContract: string,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: any,
}

const typedPermitData: TypeData = {
  types: {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Permit" as const,
};

const typedLoanTermsData: TypeData = {
  types: {
    LoanTerms: [
      { name: "dueDate", type: "uint256" },
      { name: "principal", type: "uint256" },
      { name: "interest", type: "uint256" },
      { name: "collateralTokenId", type: "uint256" },
      { name: "payableCurrency", type: "address" },
    ],
  },
  primaryType: "LoanTerms" as const,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildData = (verifyingContract: string, name: string, version: string, message: any, typeData: TypeData): Eip712Data => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const chainId = hre.network.config.chainId!;
  return Object.assign({}, typeData, {
    domain: {
      name,
      version,
      chainId,
      verifyingContract,
    },
    message,
  });
};

// inspired by https://github.com/gnosis/gp-v2-contracts/blob/af9f84aab666c06e72e990dfe20afdfe09db6df4/src/ts/sign.ts#L133-L147
async function signTypedData(signer: SignerWithAddress | Wallet, data: Eip712Data): Promise<ECDSASignature> {
  return fromRpcSig(await signer._signTypedData(data.domain, data.types, data.message));
}

/**
 * Create an EIP712 signature for loan terms
 * @param verifyingContract The address of the contract that will be verifying this signature
 * @param name The name of the contract that will be verifying this signature
 * @param terms the LoanTerms object to sign
 * @param signer The EOA to create the signature
 */
export async function createLoanTermsSignature(
  verifyingContract: string,
  name: string,
  terms: LoanTerms,
  signer: SignerWithAddress | Wallet,
): Promise<ECDSASignature> {
  const data = buildData(verifyingContract, name, "1", terms, typedLoanTermsData);
  return await signTypedData(signer, data);
}

/**
 * Create an EIP712 signature for ERC721 permit
 * @param verifyingContract The address of the contract that will be verifying this signature
 * @param name The name of the contract that will be verifying this signature
 * @param permitData the data of the permit to sign
 * @param signer The EOA to create the signature
 */
export async function createPermitSignature(
  verifyingContract: string,
  name: string,
  permitData: PermitData,
  signer: SignerWithAddress | Wallet,
): Promise<ECDSASignature> {
  const data = buildData(verifyingContract, name, "1", permitData, typedPermitData);
  return await signTypedData(signer, data);
}
