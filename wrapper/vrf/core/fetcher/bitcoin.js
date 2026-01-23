// bitcoin.js
// Bitcoin block fetching logic
import { FINALITY, BTC_BLOCK_COUNT } from '../constants.js';
import { CONFIG } from '../config.js';
import { Block } from '../models/Block.js';
import { getBtcBlockCache, setBtcBlockCache } from './cache-persist.js';
import { logInfo, logError } from '../logs/logger.js';

let lastBtcApiCall = 0; // In-memory throttle for BTC API

/**
 * Fetch N recent Bitcoin block hashes with provenance, using cache
 * @param {number} n - Number of blocks to fetch (defaults to BTC_BLOCK_COUNT)
 * @returns {Promise<Object[]>} - Array of block info objects
 */
export async function getBitcoinBlocks(n = BTC_BLOCK_COUNT) {
  if (!Number.isInteger(n) || n <= 0) throw new Error('BTC block count must be a positive integer');
  const now = Date.now();
  const cache = getBtcBlockCache();
  if (now - lastBtcApiCall < CONFIG.BTC_API_THROTTLE) {
    if (cache && cache.blocks && cache.blocks.length >= n) {
      logInfo('BTC API throttled, returning cached data', { n });
      return cache.blocks.slice(0, n);
    } else {
      throw new Error(`BTC API throttled and no cached data: wait ${Math.ceil((CONFIG.BTC_API_THROTTLE - (now - lastBtcApiCall))/1000)}s`);
    }
  }
  lastBtcApiCall = now;
  try {
    if (cache && (now - cache.timestamp < CONFIG.BTC_CACHE_DURATION) && cache.blocks.length >= n) {
      logInfo('BTC block cache hit', { n });
      return cache.blocks.slice(0, n);
    }
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const latestResp = await fetch('https://mempool.space/api/v1/blocks');
        if (!latestResp.ok) throw new Error(`HTTP ${latestResp.status}: ${latestResp.statusText}`);
        const latestBatch = await latestResp.json();
        if (!Array.isArray(latestBatch) || latestBatch.length === 0) throw new Error('No blocks found');
        const latestHeight = latestBatch[0].height;
        const blocks = [];
        for (let i = 0; i < n; i++) {
          const height = latestHeight - FINALITY.bitcoin.confirmations - i;
          if (height <= 0) break;
          const url = `https://mempool.space/api/block-height/${height}`;
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const blockHash = await resp.text();
          const blockUrl = `https://mempool.space/api/v1/block/${blockHash}`;
          const blockResp = await fetch(blockUrl);
          if (!blockResp.ok) continue;
          const block = await blockResp.json();
          const universalBlock = btcApiToBlock(block, latestHeight);
          if (universalBlock.isFinal) {
            blocks.push(universalBlock);
          }
        }
        setBtcBlockCache(blocks);
        logInfo('BTC blocks fetched from API', { n });
        return blocks;
      } catch (err) {
        lastErr = err;
        logError(`BTC fetch attempt ${attempt} failed`, { n, error: err.message });
        if (attempt < 3) await new Promise(r => setTimeout(r, 200 * attempt));
      }
    }
    throw lastErr;
  } catch (err) {
    logError('BTC fetch error', { n, error: err.message });
    throw err;
  }
}

// Helper: Convert BTC API block to universal Block
export function btcApiToBlock(block, latestHeight) {
  const confirms = latestHeight - block.height + 1;
  return new Block({
    hash: block.id,
    height: block.height,
    time: block.timestamp,
    source: 'bitcoin',
    confirms
  });
}
