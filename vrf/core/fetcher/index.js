// index.js
// Main fetcher interface

import { getBitcoinBlocks, btcApiToBlock } from './bitcoin.js';
import { getKaspaBlocks, kaspaApiToBlock } from './kaspa.js';
import { getQRNG } from './qrng.js';
import { generateMockBlocks } from './utilities.js';

// Registry for extensible randomness sources
const RANDOMNESS_FETCHERS = {
    bitcoin: getBitcoinBlocks,
    kaspa: getKaspaBlocks,
    qrng: getQRNG,
    // Add new sources here: 'newsource': getNewSourceBlocks
};

export async function fetchBlocks(source, n, useMock = false) {
    if (useMock) {
        if (source === 'hybrid') {
            return {
                bitcoin: generateMockBlocks(n, 'bitcoin'),
                kaspa: generateMockBlocks(n, 'kaspa'),
            };
        }
        return {
            [source]: generateMockBlocks(n, source),
        };
    }
    if (source === 'hybrid') {
        return {
            bitcoin: await getBitcoinBlocks(n),
            kaspa: await getKaspaBlocks(n),
        };
    }
    const fetcher = RANDOMNESS_FETCHERS[source];
    if (!fetcher) throw new Error(`Unknown source: ${source}`);
    return { [source]: await fetcher(n) };
}

export { getBitcoinBlocks, getKaspaBlocks, getQRNG, btcApiToBlock, kaspaApiToBlock, generateMockBlocks };
