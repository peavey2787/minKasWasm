// test_walk_backward_to_match.js
// Production-grade test for walking the DAG backward to find a match

import { scanDagBackward } from '../../wrapper/dag_walk.js';
import { connect } from '../../wrapper/kaspa_client.js';
import { hexToString } from '../../wrapper/utilities.js';

function isHex64(s) {
  return typeof s === 'string' && /^[a-fA-F0-9]{64}$/.test(s);
}

function makeLogger(logFn) {
  const streamLogFn = typeof logFn === 'function' ? logFn : null;
  return (msg) => {
    try {
      if (streamLogFn) streamLogFn(msg);
    } catch {
      // ignore
    }
    try {
      console.log(msg);
    } catch {
      // ignore
    }
  };
}

function payloadMatches(tx, matchText) {
  if (!tx?.payload || typeof tx.payload !== 'string') return false;

  // Try decoded payload match (ASCII)
  try {
    const decoded = hexToString(tx.payload);
    if (typeof decoded === 'string' && decoded.toLowerCase().includes(matchText.toLowerCase())) return true;
  } catch {
    // ignore
  }

  // Also allow matching raw hex payload
  try {
    if (tx.payload.toLowerCase().includes(matchText.toLowerCase())) return true;
  } catch {
    // ignore
  }

  return false;
}

function clipText(s, maxLen) {
  if (typeof s !== 'string') return '';
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function cleanPrintableAscii(s) {
  if (typeof s !== 'string' || s.length === 0) return '';
  return s.replace(/[^\x20-\x7E]/g, '');
}

function looksLikeUsefulPlaintext(cleaned) {
  if (typeof cleaned !== 'string') return false;
  const t = cleaned.trim();
  if (t.length < 8) return false;
  const alphaNumCount = (t.match(/[A-Za-z0-9]/g) || []).length;
  if (alphaNumCount < Math.max(3, Math.floor(t.length * 0.15))) return false;
  const uniqueChars = new Set(t).size;
  if (uniqueChars <= 2 && t.length >= 12) return false;
  return true;
}

async function discoverPlaintextPayload({ client, startHash, maxSeconds, logFn }) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  const startedAt = Date.now();
  const maxSecondsNum = Number(maxSeconds);
  const deadline = startedAt + (Number.isFinite(maxSecondsNum) ? maxSecondsNum * 1000 : 8000);

  let lowHash = startHash;
  const seenLowHashes = new Set();
  let best = null;
  let batches = 0;

  while (Date.now() < deadline) {
    if (seenLowHashes.has(lowHash)) {
      log('[AUTO] Probe detected repeating lowHash; stopping.');
      break;
    }
    seenLowHashes.add(lowHash);
    batches++;

    let resp;
    try {
      log(`[RPC] getBlocks({ lowHash: ${lowHash} })`);
      resp = await client.getBlocks({ lowHash, includeBlocks: true, includeTransactions: true });
    } catch (err) {
      log(`[ERROR] Probe RPC failed: ${err?.message || err}`);
      break;
    }

    const blocks = resp?.blocks;
    if (!Array.isArray(blocks) || blocks.length === 0) break;

    for (const block of blocks) {
      const blockHash = (block?.hash || block?.header?.hash || '').toString();
      if (!isHex64(blockHash)) continue;

      const txs = Array.isArray(block?.transactions) ? block.transactions : [];
      for (const tx of txs) {
        const payloadHex = tx?.payload;
        if (typeof payloadHex !== 'string' || payloadHex.length < 2) continue;

        let decoded;
        try {
          decoded = hexToString(payloadHex);
        } catch {
          continue;
        }
        if (typeof decoded !== 'string' || decoded.length === 0) continue;

        const cleaned = cleanPrintableAscii(decoded);
        if (!looksLikeUsefulPlaintext(cleaned)) continue;

        const printableRatio = cleaned.length / Math.max(1, decoded.length);
        const score = (cleaned.length * 2) + Math.floor(printableRatio * 100);
        if (!best || score > best.score) {
          best = {
            score,
            payload: cleaned,
            blockHash,
            txId: tx?.verboseData?.transactionId || null,
            elapsedMs: Date.now() - startedAt,
            batches
          };
          if (cleaned.length >= 24 && printableRatio >= 0.8) {
            log('[AUTO] Probe found strong plaintext candidate; stopping early.');
            return best;
          }
        }
      }
    }

    const last = blocks[blocks.length - 1];
    const nextLowHash = (last?.hash || last?.header?.hash || '').toString();
    if (!isHex64(nextLowHash) || nextLowHash === lowHash) break;
    lowHash = nextLowHash;
  }

  return best;
}

/**
 * Runs the DAG walk backward until a match is found.
 *
 * Preferred signature:
 *   runTestWalkBackwardToMatch({ startHash, matchText, maxSeconds, networkId, logFn })
 *
 * Backward compatible signature (used by older dashboards):
 *   runTestWalkBackwardToMatch(startHash, matchText, logFn)
 */
export async function runTestWalkBackwardToMatch(arg1, arg2, arg3) {
  const opts = (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1))
    ? arg1
    : { startHash: arg1, matchText: arg2, logFn: arg3 };

  const {
    startHash,
    matchText,
    maxSeconds = 10,
    networkId = 'mainnet',
    logFn
  } = opts;

  const log = makeLogger(logFn);

  if (!isHex64(startHash)) {
    log('[ERROR] Invalid or missing startHash (expected 64 hex chars).');
    return '[FAIL] Invalid startHash.';
  }
  const userProvidedMatch = typeof matchText === 'string' ? matchText.trim() : '';

  log('[INIT] Connecting to Kaspa node...');
  let client;
  try {
    client = await connect(null, networkId);
    log(`[OK] Connected to Kaspa ${networkId}`);
  } catch (err) {
    log(`[ERROR] Failed to connect: ${err?.message || err}`);
    return '[FAIL] Could not connect to Kaspa node.';
  }

  let effectiveMatchText = userProvidedMatch;
  let effectiveStartHash = startHash;

  if (!effectiveMatchText) {
    const maxSecondsNum = Number(maxSeconds);
    if (!Number.isFinite(maxSecondsNum) || maxSecondsNum <= 0) {
      log('[ERROR] maxSeconds must be a positive number.');
      return '[FAIL] Invalid maxSeconds.';
    }

    const probeSeconds = Math.max(8, Math.min(20, Math.floor(maxSecondsNum * 1.5)));
    log(`[AUTO] No matchText provided. Probing for ~${probeSeconds}s to discover a plaintext payload...`);

    let discovered;
    try {
      discovered = await discoverPlaintextPayload({
        client,
        startHash,
        maxSeconds: probeSeconds,
        logFn: log
      });
    } catch (err) {
      log(`[ERROR] Probe failed: ${err?.message || err}`);
      return '[FAIL] Probe failed.';
    }

    if (!discovered?.payload || !isHex64(discovered?.blockHash)) {
      log('[FAIL] Could not find any plaintext payload during probe window.');
      return '[FAIL] No plaintext payload found to test against.';
    }

    effectiveMatchText = clipText(discovered.payload, 32);
    effectiveStartHash = discovered.blockHash;
    log(`[AUTO] Found candidate plaintext payload snippet: "${effectiveMatchText}"`);
    log(`[AUTO] Candidate was found in block: ${discovered.blockHash.slice(0, 8)}...`);
    if (discovered?.txId) log(`[AUTO] Candidate txId: ${String(discovered.txId).slice(0, 8)}...`);
    if (Number.isFinite(discovered?.elapsedMs)) log(`[AUTO] Discovery time: ${discovered.elapsedMs}ms`);
    log(`[AUTO] Starting backward scan from candidate block: ${discovered.blockHash.slice(0, 8)}...`);
  }

  log(`[START] Walking DAG backward from ${effectiveStartHash.slice(0, 8)}... to match: ${effectiveMatchText}`);

  const matchFn = (block, tx) => {
    const blockHash = block?.hash || block?.header?.hash;
    if (blockHash && isHex64(effectiveMatchText) && blockHash === effectiveMatchText) return true;

    const txid = tx?.verboseData?.transactionId;
    if (txid && isHex64(effectiveMatchText) && txid === effectiveMatchText) return true;

    if (tx) {
      return payloadMatches(tx, effectiveMatchText);
    }

    return false;
  };

  try {
    const result = await scanDagBackward({
      client,
      startHash: effectiveStartHash,
      matchFn,
      maxSeconds,
      logFn: log
    });

    if (!result) {
      log('[END] No match found.');
      return '[FAIL] No match found.';
    }

    const foundBlockHash = result.block?.hash || result.block?.header?.hash || '';
    const foundTxid = result.tx?.verboseData?.transactionId || null;

    log(`[MATCH] Found in block: ${foundBlockHash}`);
    if (foundTxid) log(`[MATCH] TxID: ${foundTxid}`);

    return `[PASS] Match found in block ${foundBlockHash.slice(0, 8)}...`;
  } catch (err) {
    log(`[ERROR] Backward scan failed: ${err?.message || err}`);
    return '[FAIL] Backward scan failed.';
  }
}
