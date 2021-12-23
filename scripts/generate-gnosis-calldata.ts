import { fromRpcSig } from "ethereumjs-util";
import * as ethers from "ethers";
import fs from 'fs'

import OriginationControllerAbi from '../artifacts/contracts/OriginationController.sol/OriginationController.json'
import ERC20Abi from './erc20abi.json'

export function main(filepath: string): void {
    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");

    const loanTermsStr = fs.readFileSync(filepath, 'utf-8');
    const { terms, borrower, lender, sig } = JSON.parse(loanTermsStr);

    const { v, r, s } = fromRpcSig(sig);

    console.log('Signature parts:');
    console.log('v:', v);
    console.log('r:', Buffer.from(r).toString('base64'));
    console.log('s:', Buffer.from(s).toString('base64'));
    console.log('='.repeat(80));

    const iface = new ethers.utils.Interface(OriginationControllerAbi.abi);

    const encodedData = iface.encodeFunctionData('initializeLoan', [
        terms,
        borrower,
        lender,
        v,
        r,
        s
    ]);

    console.log('Encoded Calldata:')
    console.log(encodedData);

    const iface2 = new ethers.utils.Interface(ERC20Abi);

    const encodedData2 = iface2.encodeFunctionData('approve', [
        '0x0585a675029C68A6AF41Ba1350BC8172D6172320',
        ethers.utils.parseUnits('650000', 6)
    ]);

    console.log('Encoded Approval Calldata:')
    console.log(encodedData2);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
    main(process.argv[2])
}
