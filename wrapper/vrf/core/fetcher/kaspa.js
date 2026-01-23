// kaspa.js
// Kaspa block fetching logic
import { API_CONFIG, KASPA_BLOCK_COUNT } from '../constants.js';
import { Block } from '../models/Block.js';
import { logInfo, logError } from '../logs/logger.js';

/**
 * Fetch N recent Kaspa block hashes (DAG traversal, blue chain)
 * @param {number} n - Number of blocks to fetch (defaults to KASPA_BLOCK_COUNT)
 * @returns {Promise<Object[]>} - Array of block info objects
 */
export async function getKaspaBlocks(n = KASPA_BLOCK_COUNT) {
  try {
    if (!Number.isInteger(n) || n <= 0) throw new Error('Kaspa block count must be a positive integer');
    const kaspaConfig = API_CONFIG.kaspa;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const blockdagResp = await fetch(kaspaConfig.endpoint + '/info/blockdag');
        if (!blockdagResp.ok) throw new Error(`HTTP ${blockdagResp.status}: ${blockdagResp.statusText}`);
        const blockdagData = await blockdagResp.json();
        const tipHashes = blockdagData.tipHashes;
        if (!Array.isArray(tipHashes) || tipHashes.length === 0) throw new Error('No tip hashes found');
        const tipHash = tipHashes[0];
        const tipResp = await fetch(`${kaspaConfig.endpoint}/blocks/${tipHash}?verbose=true`);
        if (!tipResp.ok) throw new Error(`Failed to fetch Kaspa tip block`);
        const tipData = await tipResp.json();
        const tipBlueScore = tipData.header?.blueScore;
        let currentBlock = tipData;
        let currentHash = tipHash;
        let blocks = [];
        while (blocks.length < n) {
          const blueScore = currentBlock.header?.blueScore;
          const confirmations = tipBlueScore && blueScore ? (tipBlueScore - blueScore + 1) : 0;
          const block = kaspaApiToBlock(currentBlock, confirmations);
          if (block.isFinal) {
            blocks.push(block);
          }
          // Find selected parent (the canonical blue chain)
          const parents = currentBlock.header?.parents || [];
          let selectedParentHash = null;
          const selectedParentObj = parents.find(p => p.isSelectedParent);
          if (selectedParentObj && selectedParentObj.parentHashes && selectedParentObj.parentHashes.length > 0) {
            selectedParentHash = selectedParentObj.parentHashes[0];
          } else if (parents.length > 0 && parents[0].parentHashes && parents[0].parentHashes.length > 0) {
            selectedParentHash = parents[0].parentHashes[0];
          }
          if (!selectedParentHash) break;
          const parentResp = await fetch(`${kaspaConfig.endpoint}/blocks/${selectedParentHash}?verbose=true`);
          if (!parentResp.ok) break;
          currentBlock = await parentResp.json();
          currentHash = selectedParentHash;
        }
        logInfo('Kaspa blocks fetched', { n });
        return blocks;
      } catch (err) {
        lastErr = err;
        logError(`Kaspa fetch attempt ${attempt} failed`, { n, error: err.message });
        if (attempt < 3) await new Promise(r => setTimeout(r, 200 * attempt));
      }
    }
    throw lastErr;
  } catch (err) {
    logError('Kaspa fetch error', { n, error: err.message });
    throw err;
  }
}

// Helper: Convert Kaspa API block to universal Block
export function kaspaApiToBlock(block, confirms) {
  let hash = block.hash;
  if (!hash && block.verboseData && block.verboseData.hash) {
    hash = block.verboseData.hash;
  }
  return new Block({
    hash,
    height: block.header?.blueScore,
    time: parseInt(block.header?.timestamp) || 0,
    source: 'kaspa',
    confirms
  });
}