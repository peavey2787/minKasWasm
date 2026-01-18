// scanner-adapter.js
// Adapter to get Kaspa blocks from the wrapper's block scanner instead of API

import { Block } from '../models/Block.js';
import { FINALITY, KASPA_BLOCK_COUNT } from '../constants.js';
import { logInfo, logError } from '../logs/logger.js';

/**
 * Safely convert BigInt to Number for comparison/display
 */
function toNumber(val) {
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'string') return parseInt(val, 10) || 0;
  return val ?? 0;
}

/**
 * Compare two values that may be BigInt or Number
 */
function compareBigIntSafe(a, b) {
  const bigA = typeof a === 'bigint' ? a : BigInt(a || 0);
  const bigB = typeof b === 'bigint' ? b : BigInt(b || 0);
  if (bigA > bigB) return 1;
  if (bigA < bigB) return -1;
  return 0;
}

/**
 * Convert a block from the wrapper scanner format to VRF Block model
 * @param {Object} block - Block from wrapper scanner
 * @param {bigint|number} tipBlueScore - Current tip blue score for confirmation calculation
 * @returns {Block}
 */
export function scannerBlockToVrfBlock(block, tipBlueScore = null) {
  const hash = block?.header?.hash || block?.hash;
  const blueScoreRaw = block?.header?.blueScore || block?.blueScore;
  const timestampRaw = block?.header?.timestamp || block?.timestamp || block?.time;
  
  // Convert BigInt values safely
  const blueScore = toNumber(blueScoreRaw);
  const timestamp = toNumber(timestampRaw);
  const tipScore = toNumber(tipBlueScore);
  
  const confirms = tipScore && blueScore ? (tipScore - blueScore + 1) : (block?.confirms ?? 0);
  
  return new Block({
    hash,
    height: blueScore,
    blueScore,
    time: timestamp,
    source: 'kaspa',
    confirms
  });
}

/**
 * Collect Kaspa blocks from a running KaspaBlockScanner instance
 * @param {KaspaBlockScanner} scanner - Active scanner instance
 * @param {number} count - Number of blocks to collect
 * @param {number} timeoutMs - Maximum time to wait for blocks (default: 30s)
 * @returns {Promise<Block[]>}
 */
export async function collectKaspaBlocksFromScanner(scanner, count = KASPA_BLOCK_COUNT, timeoutMs = 30000) {
  if (!scanner || !scanner.indexer) {
    throw new Error('Scanner with indexer required');
  }

  const blocks = [];

  // First, try to get blocks from the indexer's in-memory or cached blocks
  const indexedBlocks = scanner.indexer.getAllBlocks?.() || [];
  
  if (indexedBlocks.length > 0) {
    // Sort by blue score descending (most recent first) - handle BigInt
    const sorted = [...indexedBlocks].sort((a, b) => {
      const scoreA = a?.header?.blueScore || a?.blueScore || 0;
      const scoreB = b?.header?.blueScore || b?.blueScore || 0;
      return compareBigIntSafe(scoreB, scoreA);
    });

    const tipBlueScore = sorted[0]?.header?.blueScore || sorted[0]?.blueScore || 0;

    for (let i = 0; i < Math.min(count, sorted.length); i++) {
      const vrfBlock = scannerBlockToVrfBlock(sorted[i], tipBlueScore);
      // Check finality (use dag depth from constants)
      if (vrfBlock.confirms >= FINALITY.kaspa.dagDepth || vrfBlock.blueScore) {
        vrfBlock.isFinal = true;
        blocks.push(vrfBlock);
      }
    }

    if (blocks.length >= count) {
      logInfo('Kaspa blocks collected from scanner indexer', { count: blocks.length });
      return blocks.slice(0, count);
    }
  }

  // If not enough blocks from indexer, wait for new blocks
  return new Promise((resolve, reject) => {
    const collectedBlocks = [...blocks];
    let originalOnBlock = scanner.onBlock;

    const cleanup = () => {
      scanner.onBlock = originalOnBlock;
    };

    const timeout = setTimeout(() => {
      cleanup();
      if (collectedBlocks.length > 0) {
        logInfo('Kaspa blocks collected (partial, timeout)', { count: collectedBlocks.length });
        resolve(collectedBlocks);
      } else {
        reject(new Error('Timeout waiting for Kaspa blocks from scanner'));
      }
    }, timeoutMs);

    scanner.onBlock = (block, matches) => {
      // Call original handler if it exists
      if (typeof originalOnBlock === 'function') {
        originalOnBlock(block, matches);
      }

      const tipBlueScore = block?.header?.blueScore || 0;
      const vrfBlock = scannerBlockToVrfBlock(block, tipBlueScore);
      vrfBlock.isFinal = true; // Live blocks from scanner are considered final
      
      // Avoid duplicates
      const exists = collectedBlocks.some(b => b.hash === vrfBlock.hash);
      if (!exists && vrfBlock.hash) {
        collectedBlocks.push(vrfBlock);
      }

      if (collectedBlocks.length >= count) {
        clearTimeout(timeout);
        cleanup();
        logInfo('Kaspa blocks collected from scanner live stream', { count: collectedBlocks.length });
        resolve(collectedBlocks.slice(0, count));
      }
    };
  });
}

/**
 * Get blocks that are already indexed (no waiting)
 * @param {KaspaBlockScanner} scanner - Scanner with indexer
 * @param {number} count - Max blocks to return
 * @returns {Block[]}
 */
export function getIndexedKaspaBlocks(scanner, count = KASPA_BLOCK_COUNT) {
  if (!scanner || !scanner.indexer) {
    return [];
  }

  const indexedBlocks = scanner.indexer.getAllBlocks?.() || [];
  
  if (indexedBlocks.length === 0) {
    return [];
  }

  // Sort by blue score descending - handle BigInt
  const sorted = [...indexedBlocks].sort((a, b) => {
    const scoreA = a?.header?.blueScore || a?.blueScore || 0;
    const scoreB = b?.header?.blueScore || b?.blueScore || 0;
    return compareBigIntSafe(scoreB, scoreA);
  });

  const tipBlueScore = sorted[0]?.header?.blueScore || sorted[0]?.blueScore || 0;
  const blocks = [];

  for (let i = 0; i < Math.min(count, sorted.length); i++) {
    const vrfBlock = scannerBlockToVrfBlock(sorted[i], tipBlueScore);
    vrfBlock.isFinal = true;
    blocks.push(vrfBlock);
  }

  return blocks;
}
