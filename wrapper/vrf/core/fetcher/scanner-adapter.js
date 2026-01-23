// scanner-adapter.js
// Adapter to get Kaspa blocks from the wrapper's block scanner instead of API

import { scannerBlockToVrfBlock, compareBigIntSafe } from './utilities.js';
import { FINALITY, KASPA_BLOCK_COUNT } from '../constants.js';
import { logInfo, logError } from '../logs/logger.js';

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
  let indexedBlocks = scanner.indexer.getAllBlocks?.() || [];
  
  // If in-memory isn't enough, try the persistent cache as a safety net
  if (indexedBlocks.length < count && typeof scanner.indexer.getAllCachedBlocks === 'function') {
    try {
      const cachedBlocks = await scanner.indexer.getAllCachedBlocks();
      if (Array.isArray(cachedBlocks)) {
        // Merge and deduplicate
        const seenHashes = new Set(indexedBlocks.map(b => b?.header?.hash || b?.hash));
        for (const b of cachedBlocks) {
          const h = b?.header?.hash || b?.hash;
          if (h && !seenHashes.has(h)) {
            indexedBlocks.push(b);
            seenHashes.add(h);
          }
        }
      }
    } catch (e) {
      logError('Failed to fetch cached blocks in scanner adapter', e);
    }
  }

  if (indexedBlocks.length > 0) {
    // Sort by blue score descending (most recent first) - handle BigInt
    const sorted = [...indexedBlocks].sort((a, b) => {
      const scoreA = a?.header?.blueScore || a?.blueScore || 0;
      const scoreB = b?.header?.blueScore || b?.blueScore || 0;
      return compareBigIntSafe(scoreB, scoreA);
    });

    const tipBlueScore = sorted[0]?.header?.blueScore || sorted[0]?.blueScore || 0;

    for (let i = 0; i < sorted.length; i++) {
      if (blocks.length >= count) break;
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