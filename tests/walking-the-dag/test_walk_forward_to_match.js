// test_walk_forward_to_match.js
// Production-grade test for walking the DAG forward to find a match

import { scanDagForward } from '../../wrapper/dag_walk.js';
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
  // Avoid matching on mostly punctuation.
  const alphaNumCount = (t.match(/[A-Za-z0-9]/g) || []).length;
  if (alphaNumCount < Math.max(3, Math.floor(t.length * 0.15))) return false;
  // Avoid extreme repeats like "aaaaaaaaaaaaaa".
  const uniqueChars = new Set(t).size;
  if (uniqueChars <= 2 && t.length >= 12) return false;
  return true;
}

async function discoverPlaintextPayload({ client, startHash, maxSeconds, minTimestamp, logFn }) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  const startedAt = Date.now();
  const deadline = startedAt + (Number(maxSeconds) * 1000);

  let lowHash = startHash;
  const seenLowHashes = new Set();
  let batches = 0;
  let scannedBlocks = 0;
  let scannedTxs = 0;
  let best = null;

  while (Date.now() < deadline) {
    if (seenLowHashes.has(lowHash)) {
      log(`[AUTO] Probe detected repeating lowHash; stopping to avoid loop.`);
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
    if (!Array.isArray(blocks) || blocks.length === 0) {
      log(`[AUTO] Probe received no blocks; stopping.`);
      break;
    }

    let batchTxs = 0;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const blockHash = (block?.hash || block?.header?.hash || '').toString();
      const blockTime = Number(block?.verboseData?.timestamp ?? block?.header?.timestamp ?? 0);
      if (Number.isFinite(minTimestamp) && blockTime < Number(minTimestamp)) continue;

      scannedBlocks++;
      const txs = Array.isArray(block?.transactions) ? block.transactions : [];
      for (const tx of txs) {
        batchTxs++;
        scannedTxs++;
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

        // Score candidates: prefer longer + more printable.
        const printableRatio = cleaned.length / Math.max(1, decoded.length);
        const score = (cleaned.length * 2) + Math.floor(printableRatio * 100);

        if (!best || score > best.score) {
          const prevBlock = i > 0 ? blocks[i - 1] : null;
          const fallbackPrevHash = (prevBlock?.hash || prevBlock?.header?.hash || '').toString();

          // IMPORTANT: scanDagForward's getBlocks() responses can vary depending on the lowHash.
          // For reliability, prefer a restart hash that we know is "prior" in THIS response ordering.
          // If that fails, fall back to the original probe startHash (also prior to the candidate,
          // since the candidate was discovered while scanning forward from it).
          const restartHash = isHex64(fallbackPrevHash)
            ? fallbackPrevHash
            : (isHex64(startHash) ? startHash : lowHash);

          best = {
            score,
            payload: cleaned,
            parentHash: restartHash,
            blockHash: isHex64(blockHash) ? blockHash : null,
            txId: tx?.verboseData?.transactionId || null,
            elapsedMs: Date.now() - startedAt
          };

          // Early exit if we found a very strong candidate.
          if (cleaned.length >= 24 && printableRatio >= 0.8) {
            log(`[AUTO] Probe found strong plaintext candidate; stopping early.`);
            return best;
          }
        }
      }
    }

    log(`[AUTO] Probe batch ${batches}: scanned ${blocks.length} blocks, ${batchTxs} txs (total blocks=${scannedBlocks}, txs=${scannedTxs}).`);

    // Advance lowHash defensively.
    const last = blocks[blocks.length - 1];
    const nextLowHash = (last?.hash || last?.header?.hash || '').toString();
    if (!isHex64(nextLowHash) || nextLowHash === lowHash) {
      log(`[AUTO] Probe lowHash did not advance; stopping.`);
      break;
    }
    lowHash = nextLowHash;
  }

  return best;
}

/**
 * Runs the DAG walk forward until a match is found (within the time budget).
 *
 * Preferred signature:
 *   runTestWalkForwardToMatch({ startHash, matchText, maxSeconds, minTimestamp, networkId, logFn })
 *
 * Backward compatible signature (used by older dashboards):
 *   runTestWalkForwardToMatch(startHash, matchText, logFn)
 */
export async function runTestWalkForwardToMatch(arg1, arg2, arg3) {
  const opts = (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1))
    ? arg1
    : { startHash: arg1, matchText: arg2, logFn: arg3 };

  const {
    startHash,
    matchText,
    maxSeconds = 10,
    minTimestamp = 0,
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

  log(`[START] Walking DAG forward from ${startHash.slice(0, 8)}...`);

  // If user didn't provide a matchText, automatically discover one by inspecting
  // incoming blocks and looking for a hex-decoded plaintext payload.
  let effectiveMatchText = userProvidedMatch;
  let effectiveStartHash = startHash;
  let discovered = null;

  if (!effectiveMatchText) {
    const maxSecondsNum = Number(maxSeconds);
    if (!Number.isFinite(maxSecondsNum) || maxSecondsNum <= 0) {
      log('[ERROR] maxSeconds must be a positive number.');
      return '[FAIL] Invalid maxSeconds.';
    }

    const probeSeconds = Math.max(8, Math.min(20, Math.floor(maxSecondsNum * 1.5)));
    log(`[AUTO] No matchText provided. Probing for ~${probeSeconds}s to discover a plaintext payload...`);

    try {
      discovered = await discoverPlaintextPayload({
        client,
        startHash,
        maxSeconds: probeSeconds,
        minTimestamp,
        logFn: log
      });
    } catch (err) {
      log(`[ERROR] Probe failed: ${err?.message || err}`);
      return '[FAIL] Probe failed.';
    }

    if (!discovered?.payload) {
      log('[FAIL] Could not find any plaintext payload during probe window.');
      return '[FAIL] No plaintext payload found to test against.';
    }
    if (!isHex64(discovered?.parentHash)) {
      log('[FAIL] Probe found a payload but no usable parent hash to restart from.');
      return '[FAIL] No parent hash available for restart.';
    }

    // Use a short snippet for matching to avoid brittleness.
    effectiveMatchText = clipText(discovered.payload, 32);
    effectiveStartHash = discovered.parentHash;
    log(`[AUTO] Found candidate plaintext payload snippet: "${effectiveMatchText}"`);
    if (isHex64(discovered?.blockHash)) log(`[AUTO] Candidate was found in block: ${discovered.blockHash.slice(0, 8)}...`);
    if (discovered?.txId) log(`[AUTO] Candidate txId: ${String(discovered.txId).slice(0, 8)}...`);
    if (Number.isFinite(discovered?.elapsedMs)) log(`[AUTO] Discovery time: ${discovered.elapsedMs}ms`);
    log(`[AUTO] Restarting forward scan from prior block: ${discovered.parentHash.slice(0, 8)}...`);
  } else {
    log(`[INFO] Using user-provided matchText: ${effectiveMatchText}`);
  }

  try {
    // 2nd phase: prove we can find the payload again by scanning forward from a prior block hash.
    // Use scanDagForward so we are testing the forward scanning primitive.
    const mode = isHex64(effectiveMatchText) ? 'exact' : 'contains';

    const maxSecondsNum = Number(maxSeconds);
    const timeBudgetSeconds = Number.isFinite(maxSecondsNum) && maxSecondsNum > 0 ? maxSecondsNum : 10;

    // scanDagForward's paging can be sensitive to the chosen lowHash.
    // To keep the test robust, try a small set of start hashes (prior-first), splitting time budget.
    const candidateStartHashes = [];
    if (isHex64(effectiveStartHash)) candidateStartHashes.push(effectiveStartHash);
    if (isHex64(startHash) && startHash !== effectiveStartHash) candidateStartHashes.push(startHash);
    // As a last resort (NOT prior), try the candidate block itself if we found one.
    // This helps diagnose RPC paging edge-cases without changing production code.
    const discoveredBlockHash = (!userProvidedMatch && typeof discovered?.blockHash === 'string') ? discovered.blockHash : null;
    if (isHex64(discoveredBlockHash) && !candidateStartHashes.includes(discoveredBlockHash)) {
      candidateStartHashes.push(discoveredBlockHash);
    }

    let result = null;
    for (let i = 0; i < candidateStartHashes.length; i++) {
      const attemptStartHash = candidateStartHashes[i];
      const remainingAttempts = candidateStartHashes.length - i;
      const perAttemptSeconds = Math.max(2, Math.floor(timeBudgetSeconds / remainingAttempts));

      if (attemptStartHash === discoveredBlockHash) {
        log('[WARN] Falling back to scanning from the candidate block hash (not a prior block).');
      }
      log(`[INFO] Forward scan attempt ${i + 1}/${candidateStartHashes.length} from ${attemptStartHash.slice(0, 8)}... (budget ~${perAttemptSeconds}s)`);

      result = await scanDagForward({
        client,
        startHash: attemptStartHash,
        searchText: effectiveMatchText,
        matchMode: mode,
        maxSeconds: perAttemptSeconds,
        minTimestamp,
        logFn: log
      });

      if (result) break;
    }

    if (!result) {
      log('[END] No match found.');
      return '[FAIL] No match found.';
    }

    // If we auto-discovered a snippet, ensure we matched on decoded payload.
    if (!userProvidedMatch) {
      const matchedPayload = (result.payload ?? '').toString();
      if (!matchedPayload.toLowerCase().includes(effectiveMatchText.toLowerCase())) {
        log('[FAIL] Forward scan returned a match, but payload did not contain the expected snippet.');
        return '[FAIL] Payload verification failed.';
      }
    }

    log(`[MATCH] Found in block: ${(result.blockHash || '').slice(0, 8)}... tx: ${(result.txId || '').slice(0, 8)}...`);
    return `[PASS] Match found in block ${(result.blockHash || '').slice(0, 8)}...`;
  } catch (err) {
    log(`[ERROR] Forward scan failed: ${err?.message || err}`);
    return '[FAIL] Forward scan failed.';
  }
}
