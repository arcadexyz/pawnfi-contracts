import { BigNumber, BigNumberish } from "ethers";

export enum LoanState {
    DUMMY = 0,
    Created = 1,
    Active = 2,
    Repaid = 3,
    Defaulted = 4,
}

export interface LoanTerms {
    durationSecs: BigNumberish;
    principal: BigNumber;
    interest: BigNumber;
    collateralTokenId: BigNumber;
    payableCurrency: string;
    startDate: BigNumberish;
    numInstallments: BigNumberish;
}

export interface LoanData {
    terms: LoanTerms;
    borrowerNoteId: BigNumber;
    lenderNoteId: BigNumber;
    state: LoanState;
    dueDate: BigNumberish;
    balance:BigNumber;
    balancePaid: BigNumber;
    lateFeesAccrued: BigNumber;
    numMissedPayments: BigNumber;
}
