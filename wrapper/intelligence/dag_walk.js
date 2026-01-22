import { dehydrateTx } from '../utilities/utilities.js';
/**
 * Walks the DAG forward from a starting block hash to the present, invoking a callback for each block.
 * @param {Object} options
 * @param {Object} options.client - Kaspa RPC client
 * @param {string} options.startHash - Block hash to start from
 * @param {number} [options.maxSeconds=30] - Time budget for scanning
 * @param {number} [options.minTimestamp=0] - Minimum block timestamp to consider
 * @param {function} [options.logFn] - Optional logging function
 * @param {function} options.onBlock - Function(block) called for each block; return true to stop walking
 */
export async function walkDagToPresent({ client, startHash, maxSeconds = 30, minTimestamp = 0, logFn, onBlock } = {}) {
  if (!client) throw new Error('walkDagToPresent: client is required');
  if (typeof startHash !== 'string' || startHash.length === 0) throw new Error('walkDagToPresent: startHash is required');
  let lowHash = startHash;
  let processed = 0;
  logFn = typeof logFn === 'function' ? logFn : () => {};

  const maxSecondsNum = Number(maxSeconds);
  if (!Number.isFinite(maxSecondsNum) || maxSecondsNum <= 0) {
    throw new Error('walkDagToPresent: maxSeconds must be a positive number');
  }

  const startedAt = Date.now();
  const deadline = startedAt + (maxSecondsNum * 1000);

  while (true) {
    if (Date.now() >= deadline) {
      logFn(`[END] Time budget exceeded (maxSeconds=${maxSeconds}).`);
      break;
    }
    logFn(`[RPC] getBlocks({ lowHash: ${lowHash} })`);
    let resp;
    try {
      resp = await client.getBlocks({ lowHash, includeBlocks: true, includeTransactions: true });
    } catch (err) {
      logFn(`[ERROR] RPC failed: ${err && err.message ? err.message : err}`);
      break;
    }
    if (!resp || !resp.blocks) {
      logFn(`[END] No response or blocks for hash: ${lowHash}`);
      logFn(`[DEBUG] Response: ${JSON.stringify(resp)}`);
      break;
    }
    if (resp.blocks.length === 0) {
      logFn(`[END] Empty blocks array for hash: ${lowHash}`);
      logFn(`[DEBUG] Response: ${JSON.stringify(resp)}`);
      break;
    }
    logFn(`[INFO] Received ${resp.blocks.length} blocks for hash: ${lowHash}`);
    try{
      for (const block of resp.blocks) {
        if (Date.now() >= deadline) {
          logFn(`[END] Time budget exceeded (maxSeconds=${maxSeconds}) during batch processing.`);
          break;
        }
        processed++;
        const blockHash = block.hash || block.header?.hash || '';
        logFn(`[INFO] Block ${processed}: ${blockHash}`);
        
        const blockTime = Number(block.verboseData?.timestamp || 0);
        if (blockTime < minTimestamp) continue;

        if (typeof onBlock === 'function') {
          // 1. Create the safe copy
          const safeBlock = {
            hash: blockHash,
            timestamp: blockTime,
            // Use utilities to turn every WASM tx into a plain JS object
            transactions: Array.isArray(block.transactions) 
              ? block.transactions.map(t => utilities.dehydrateTx(t, block))
              : []
          };

          // 2. Pass the SAFE copy to the callback
          const shouldStop = onBlock(safeBlock); 
          
          if (shouldStop === true) {
            logFn('[END] onBlock requested stop.');
            return;
          }
        }
      }
    } finally {
      // --- THIS IS THE FINAL SWEEP ---
      logFn(`[CLEANUP] Freeing transactions for ${resp.blocks.length} blocks...`);
      for (const block of resp.blocks) {
        if (block.transactions) {
          for (const tx of block.transactions) {
            if (typeof tx.free === 'function') {
              tx.free();
            }
          }
        }
      }
    }

    if (Date.now() >= deadline) {
      logFn(`[END] Time budget exceeded (maxSeconds=${maxSeconds}) after batch.`);
      break;
    }

    const lastBlock = resp.blocks[resp.blocks.length - 1];
    const nextLowHash = (lastBlock?.hash || lastBlock?.header?.hash || '').toString();
    if (!nextLowHash || nextLowHash === lowHash) {
      logFn(`[END] Low hash did not advance (nextLowHash=${nextLowHash || 'null'}). Stopping to avoid infinite loop.`);
      break;
    }
    lowHash = nextLowHash;
  }
  const elapsedMs = Date.now() - startedAt;
  logFn(`[COMPLETE] walkDagToPresent finished. Processed: ${processed} blocks. Elapsed: ${elapsedMs}ms.`);
}

function createPayloadSearchWorker() {
  // Inline worker to avoid blocking UI thread when decoding/searching payloads.
  // Pre-termination + error boundaries are handled by the caller (scanDagForward).
  const workerSource = `
    const cleanPrintableAscii = (s) => {
      if (typeof s !== 'string' || s.length === 0) return '';
      let out = '';
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0x20 && c <= 0x7E) out += s[i];
      }
      return out;
    };

    let __decoder = null;
    if (typeof TextDecoder === 'function') {
      try {
        // Preferred: explicit UTF-8, non-fatal decoding (malformed sequences won't throw).
        __decoder = new TextDecoder('utf-8', { fatal: false });
      } catch {
        try {
          // Fallback: older engines may not support the options bag.
          __decoder = new TextDecoder();
        } catch {
          __decoder = null;
        }
      }
    }

    const decodeBytes = (bytes) => {
      if (__decoder && typeof __decoder.decode === 'function') {
        try {
          return __decoder.decode(bytes);
        } catch {
          return '';
        }
      }
      // Strict fallback: if TextDecoder is unavailable, do not attempt lossy decoding.
      // This prevents false-positive matches from mis-decoded payloads.
      return '';
    };

    const hexToStringFast = (hex) => {
      if (typeof hex !== 'string' || hex.length === 0) return '';
      if (hex.startsWith('0x')) hex = hex.slice(2);
      if ((hex.length % 2) !== 0) return '';
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        const byte = parseInt(hex.substr(i * 2, 2), 16);
        if (Number.isNaN(byte)) return '';
        bytes[i] = byte;
      }
      return decodeBytes(bytes);
    };

    const matches = (cleaned, searchText, matchMode) => {
      const searchTextStr = (searchText ?? '').toString();
      const needle = searchTextStr.toLowerCase();
      const lower = cleaned.toLowerCase();
      switch (matchMode) {
        case 'exact': return cleaned === searchTextStr;
        case 'prefix': return cleaned.startsWith(searchTextStr);
        case 'contains': return lower.includes(needle);
        case 'cleaned_contains': return lower.includes(needle);
        default: return false;
      }
    };

    self.onmessage = (event) => {
      const msg = event?.data;
      if (!msg || msg.type !== 'process') return;
      const { id, blocks, searchText, matchMode, minTimestamp } = msg;

      try {
        if (!Array.isArray(blocks)) {
          self.postMessage({ type: 'result', id, ok: false, error: 'blocks must be an array' });
          return;
        }

        let processedBlocks = 0;
        let processedTxs = 0;

        for (const block of blocks) {
          processedBlocks++;

          const blockTime = Number(block?.timestamp ?? 0);
          if (Number.isFinite(minTimestamp) && blockTime < Number(minTimestamp)) continue;

          const blockHash = block?.hash || '';
          const txs = Array.isArray(block?.txs) ? block.txs : [];
          for (const tx of txs) {
            processedTxs++;
            const payloadHex = tx?.payload;
            if (typeof payloadHex !== 'string' || payloadHex.length === 0) continue;

            const decoded = hexToStringFast(payloadHex);
            if (!decoded) continue;
            const cleaned = cleanPrintableAscii(decoded);
            if (!cleaned) continue;

            if (matches(cleaned, searchText, matchMode)) {
              const txId = tx?.txId;
              const blueScore = block?.blueScore;
              self.postMessage({
                type: 'result',
                id,
                ok: true,
                processedBlocks,
                processedTxs,
                match: {
                  txId,
                  blockHash,
                  blueScore,
                  payload: tx?.payload,
                  payloadCleaned: cleaned,
                  payloadHex: payloadHex,
                  timestamp: blockTime
                }
              });
              return;
            }
          }
        }

        self.postMessage({ type: 'result', id, ok: true, processedBlocks, processedTxs, match: null });
      } catch (err) {
        const message = (err && err.message) ? err.message : String(err);
        self.postMessage({ type: 'result', id, ok: false, error: message });
      }
    };
  `;

  const blob = new Blob([workerSource], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}

function createWorkerRpc(worker) {
  let nextId = 1;
  const pending = new Map();

  const onMessage = (event) => {
    const msg = event?.data;
    if (!msg || msg.type !== 'result') return;
    const { id } = msg;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (msg.ok) entry.resolve(msg);
    else entry.reject(new Error(msg.error || 'Worker failed'));
  };
  const onError = (event) => {
    const err = event?.message ? new Error(event.message) : new Error('Worker error');
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  };

  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onError);

  return {
    process(blocks, { searchText, matchMode, minTimestamp }) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'process', id, blocks, searchText, matchMode, minTimestamp });
      });
    },
    dispose() {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      for (const { reject } of pending.values()) reject(new Error('Worker disposed'));
      pending.clear();
    }
  };
}

/**
 * Scans the DAG forward from a starting block hash, searching transaction payloads for a match.
 * @param {Object} options
 * @param {Object} options.client - Kaspa RPC client
 * @param {string} options.startHash - Block hash to start from
 * @param {string} options.searchText - Text to search for in payloads
 * @param {string} options.matchMode - Matching mode: exact, prefix, contains, cleaned_contains
 * @param {number} [options.maxSeconds=30] - Time budget for scanning
 * @param {number} [options.minTimestamp=0] - Minimum block timestamp to consider
 * @param {function} [options.logFn] - Optional logging function
 * @param {Object} options.utilities - Utilities module for dehydrating transactions
 * @returns {Promise<Object|null>} - Match object or null if not found
 */
export async function scanDagForward({ client, startHash, searchText, matchMode, maxSeconds = 30, minTimestamp = 0, logFn, utilities } = {}) {
  if (!client) throw new Error('scanDagForward: client is required');
  if (typeof startHash !== 'string' || startHash.length === 0) throw new Error('scanDagForward: startHash is required');

  logFn = typeof logFn === 'function' ? logFn : () => {};

  const maxSecondsNum = Number(maxSeconds);
  if (!Number.isFinite(maxSecondsNum) || maxSecondsNum <= 0) {
    throw new Error('scanDagForward: maxSeconds must be a positive number');
  }

  const allowedModes = new Set(['exact', 'prefix', 'contains', 'cleaned_contains']);
  if (!allowedModes.has(matchMode)) {
    throw new Error(`scanDagForward: unsupported matchMode: ${matchMode}`);
  }
  if (searchText == null) {
    throw new Error('scanDagForward: searchText is required');
  }
  const searchTextStr = searchText.toString();
  if (searchTextStr.length === 0) {
    throw new Error('scanDagForward: searchText must be non-empty');
  }

  const startedAt = Date.now();
  const deadline = startedAt + (maxSecondsNum * 1000);

  let lowHash = startHash;
  let processedBatches = 0;
  let processedBlocks = 0;
  let processedTxs = 0;
  let prefetchedResp = null;
  let prefetchedForHash = null;

  const worker = createPayloadSearchWorker();
  const workerRpc = createWorkerRpc(worker);

  const awaitWithTimeout = (promise, ms, onTimeout) => {
    if (!Number.isFinite(ms) || ms <= 0) {
      onTimeout?.();
      return Promise.reject(new Error('Time budget exceeded'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          onTimeout?.();
        } finally {
          reject(new Error('Time budget exceeded'));
        }
      }, ms);
      promise
        .then((v) => {
          clearTimeout(timer);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(timer);
          reject(e);
        });
    });
  };

  const fetchBatch = async (hash) => {
    logFn(`[RPC] getBlocks({ lowHash: ${hash} })`);
    return client.getBlocks({ lowHash: hash, includeBlocks: true, includeTransactions: true });
  };

  try {
    while (true) {
      if (Date.now() >= deadline) {
        logFn(`[END] Time budget exceeded (maxSeconds=${maxSeconds}).`);
        break;
      }

      let resp;
      try {
        if (prefetchedResp && prefetchedForHash === lowHash) {
          resp = prefetchedResp;
          prefetchedResp = null;
          prefetchedForHash = null;
        } else {
          resp = await fetchBatch(lowHash);
        }
      } catch (err) {
        logFn(`[ERROR] RPC failed: ${err && err.message ? err.message : err}`);
        break;
      }

      if (!resp || !resp.blocks) {
        logFn(`[END] No response or blocks for hash: ${lowHash}`);
        logFn(`[DEBUG] Response: ${JSON.stringify(resp)}`);
        break;
      }
      if (resp.blocks.length === 0) {
        logFn(`[END] Empty blocks array for hash: ${lowHash}`);
        logFn(`[DEBUG] Response: ${JSON.stringify(resp)}`);
        break;
      }

      processedBatches++;
      logFn(`[INFO] Received ${resp.blocks.length} blocks for hash: ${lowHash} (batch ${processedBatches})`);

      const lastBlock = resp.blocks[resp.blocks.length - 1];
      const nextLowHash = (lastBlock?.hash || lastBlock?.header?.hash || '').toString();

      if (!nextLowHash || nextLowHash === lowHash) {
        logFn(`[END] Low hash did not advance (nextLowHash=${nextLowHash || 'null'}). Stopping to avoid infinite loop.`);
        // Free this specific response before breaking
        resp.blocks.forEach(b => b.transactions?.forEach(t => t.free?.()));
        break;
      }

      // Start worker processing immediately
      const compactBlocks = [];
      for (const block of resp.blocks) {
        const txs = [];
        const blockTxs = Array.isArray(block?.transactions) ? block.transactions : [];
        
        for (const tx of blockTxs) {
          // Use the utility to create a safe JS copy
          const dehydrated = utilities.dehydrateTx(tx, block);
          
          if (dehydrated && dehydrated.payloadHex) {
            txs.push(dehydrated);
          }
          
          // Free the WASM transaction immediately after extraction
          if (typeof tx.free === 'function') tx.free();
        }

        compactBlocks.push({ 
          hash: block.hash || block.header?.hash || '', 
          timestamp: Number(block.verboseData?.timestamp || 0), 
          blueScore: block.verboseData?.blueScore || 0,
          txs 
        });
      }

      const workerPromise = workerRpc.process(compactBlocks, {
        searchText: searchTextStr,
        matchMode,
        minTimestamp
      });

      const canPrefetch = Date.now() < deadline;
      const fetchPromise = canPrefetch ? fetchBatch(nextLowHash) : null;

      // Discard response reference ASAP (WASM txs are already freed)
      resp = null;

      let workerResult;
      try {
        const remainingMs = deadline - Date.now();
        workerResult = await awaitWithTimeout(workerPromise, remainingMs, () => {
          try { workerRpc.dispose(); } catch {}
          try { worker.terminate(); } catch {}
        });
      } catch (err) {
        logFn(`[ERROR] Worker processing failed: ${err?.message || err}`);
        break;
      }

      processedBlocks += Number(workerResult.processedBlocks || 0);
      processedTxs += Number(workerResult.processedTxs || 0);

      if (workerResult.match) {
        const m = workerResult.match;
        logFn(`[MATCH] Found match in tx: ${m.txid} in block: ${(m.blockHash || '').slice(0, 16)}...`);
        return m; // FINALLY block handles prefetchedResp cleanup
      }

      if (!fetchPromise) {
        break;
      }

      // Await prefetched batch for next iteration.
      let nextResp;
      try {
        nextResp = await fetchPromise;
      } catch (err) {
        logFn(`[ERROR] RPC failed (prefetch): ${err && err.message ? err.message : err}`);
        break;
      }

      lowHash = nextLowHash;
      prefetchedResp = nextResp;
      prefetchedForHash = nextLowHash;
    }
  } finally {
    // Cleanup 1: Prefetched batches that weren't used
    if (prefetchedResp && prefetchedResp.blocks) {
      prefetchedResp.blocks.forEach(b => {
        b.transactions?.forEach(t => {
          if (typeof t.free === 'function') t.free();
        });
      });
    }

    // Cleanup 2: Error boundary: always kill worker to prevent ghost processes.
    try { workerRpc.dispose(); } catch {}
    try { worker.terminate(); } catch {}
  }

  const elapsedMs = Date.now() - startedAt;
  logFn(`[COMPLETE] scanDagForward finished. Batches: ${processedBatches}. Blocks: ${processedBlocks}. Txs: ${processedTxs}. Elapsed: ${elapsedMs}ms. No match found.`);
  return null;
}


/**
 * Walks the DAG backwards, following parent links, until a match is found or the root is reached.
 * @param {Object} options
 * @param {Object} options.client - Kaspa RPC client
 * @param {string} options.startHash - Block hash to start from
 * @param {function} options.matchFn - Function(block, tx) => true if match
 * @param {Set<string>} [options.visited] - Set of already visited block hashes
 * @param {number} [options.maxSeconds=30] - Time budget for scanning
 * @param {number} [options.maxDepth=Infinity] - Optional safety limit for number of unique blocks visited
 * @returns {Promise<Object|null>} - Match object or null if not found
 */
export async function scanDagBackward({ client, startHash, matchFn, maxSeconds = 30, maxDepth = Infinity, visited = new Set(), logFn, utilities } = {}) {
  if (!client) throw new Error('scanDagBackward: client is required');
  if (typeof startHash !== 'string' || startHash.length === 0) throw new Error('scanDagBackward: startHash is required');
  if (typeof matchFn !== 'function') throw new Error('scanDagBackward: matchFn must be a function');
  
  let queue = [startHash];
  let queueHead = 0;
  let processed = 0;
  visited = visited || new Set();
  logFn = typeof logFn === 'function' ? logFn : () => {};

  const startedAt = Date.now();
  const deadline = startedAt + (Number(maxSeconds) * 1000);

  while (queueHead < queue.length) {
    if (Date.now() >= deadline) {
      logFn(`[END] Time budget exceeded (maxSeconds=${maxSeconds}).`);
      break;
    }

    const hash = queue[queueHead++];
    if (queueHead >= 5000) {
      queue = queue.slice(queueHead);
      queueHead = 0;
    }

    if (visited.has(hash)) continue;
    visited.add(hash);
    
    if (maxDepth !== Infinity && visited.size > maxDepth) {
      logFn(`[END] Max depth reached (maxDepth=${maxDepth}).`);
      break;
    }

    logFn(`[RPC] getBlock({ hash: ${hash} })`);
    let resp;
    try {
      resp = await client.getBlock({ hash, includeTransactions: true });
    } catch (err) {
      logFn(`[ERROR] RPC failed: ${err?.message || err}`);
      continue;
    }

    if (!resp || !resp.block) {
      logFn(`[END] No response or block for hash: ${hash}`);
      continue;
    }

    const block = resp.block;
    processed++;
    const blockHash = block.hash || block.header?.hash || '';
    logFn(`[INFO] Block ${processed}: ${blockHash}`);

    try {
      // 1. Check block match
      if (matchFn(block, null)) {
        logFn(`[MATCH] Found match in block: ${blockHash}`);
        // Return a safe JS object instead of the WASM block
        return { 
          blockHash, 
          timestamp: Number(block.header?.timestamp || 0),
          tx: null 
        };
      }

      // 2. Check txs match
      if (Array.isArray(block.transactions)) {
        for (const tx of block.transactions) {
          if (matchFn(block, tx)) {
            logFn(`[MATCH] Found match in tx: ${tx.verboseData?.transactionId}`);
            
            // CRITICAL: Dehydrate BEFORE the finally block calls tx.free()
            return {
              blockHash,
              tx: utilities.dehydrateTx(tx, block)
            };
          }
        }
      }

      // 3. Add parents to queue
      const parents = block.header?.parentHashes || block.parentHashes || [];
      for (const parent of parents) {
        if (!visited.has(parent)) queue.push(parent);
      }    
    } finally {
      // SWEEP: This runs even after the 'return' statements above.
      // Because we returned a dehydrated copy, freeing the WASM here is safe.
      if (block.transactions) {
        for (const t of block.transactions) {
          if (typeof t.free === 'function') t.free();
        }
      }
    }
  }

  logFn(`[COMPLETE] scanDagBackward finished. Processed: ${processed} blocks. No match found.`);
  return null;
}