/* eslint no-unused-vars: 0 */

import fs from 'fs';
import dotenv from 'dotenv';
import PinataSDK, { PinataPinListResponseRow } from '@pinata/sdk';

dotenv.config();

const METADATA_FILENAME = 'scripts/fixtures/pinata_metadata.json';

export async function main(writeToFile = false): Promise<PinataPinListResponseRow[]> {
    if (!process.env.PINATA_API_KEY) {
        throw new Error("Set PINATA_API_KEY in env to run this script.");
    }

    if (!process.env.PINATA_API_SECRET) {
        throw new Error("Set PINATA_API_SECRET in env to run this script.");
    }

    const pinata = PinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_API_SECRET);

    await pinata.testAuthentication();

    const { rows: metadata } = await pinata.pinList({
        pageLimit: 1000
    });

    if (writeToFile) {
        fs.writeFileSync(
            METADATA_FILENAME,
            JSON.stringify(metadata, null, 4)
        );
    }

    return metadata;
}

export function readMetadataFromFile(): PinataPinListResponseRow[] {
    const data =  fs.readFileSync(METADATA_FILENAME, 'utf-8');
    return JSON.parse(data);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
    main(true)
        .then(() => process.exit(0))
        .catch((error: Error) => {
            console.error(error);
            process.exit(1);
        });
}


