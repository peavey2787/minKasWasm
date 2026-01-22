// dom_handlers.js
// All handler functions for DAG walk demo UI

import * as elements from './dom_elements.js';
import { connect } from '../../wrapper/transport/kaspa_client.js';
import { walkDagToPresent, scanDagForward, scanDagBackward } from '../../wrapper/intelligence/dag_walk.js';

let kaspaClient = null;
let statsTimer = null;
let runStartedAtMs = 0;
let stats = null;

function nowIso() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function appendLog(line) {
  const logDiv = elements.getLogDiv();
  const prefix = `[${nowIso()}] `;
  logDiv.textContent += `${prefix}${line}\n`;
  logDiv.scrollTop = logDiv.scrollHeight;

  if (stats) {
    updateStatsFromLogLine(line);
    renderStats();
  }
}

function setResult(text) {
  elements.getResultDiv().textContent = text || '';
}

function setStatus(text) {
  const statusDiv = elements.getStatusDiv();
  statusDiv.textContent = text || '';
}

function setStatsLine(text) {
  const statsDiv = elements.getStatsDiv();
  statsDiv.textContent = text || '';
}

function resetStats(mode) {
  stats = {
    mode,
    rpcCalls: 0,
    batches: 0,
    lastBatchSize: 0,
    blocksProcessed: 0,
    txsProcessed: 0,
    lastBlockHashPrefix: '',
    matched: false
  };
  runStartedAtMs = Date.now();
  setStatsLine('');
}

function stopStatsTimer() {
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
}

function startStatsTimer() {
  stopStatsTimer();
  statsTimer = setInterval(() => {
    if (!stats) return;
    renderStats();
  }, 250);
}

function updateStatsFromLogLine(line) {
  // Generic
  if (line.startsWith('[RPC]')) stats.rpcCalls++;

  // Forward scan logs
  // e.g. "[INFO] Received 140 blocks for hash: ... (batch 3)"
  const forwardBatchMatch = line.match(/\[INFO\] Received (\d+) blocks .*\(batch (\d+)\)/);
  if (forwardBatchMatch) {
    stats.lastBatchSize = Number(forwardBatchMatch[1] || 0);
    stats.batches = Number(forwardBatchMatch[2] || stats.batches);
  }

  // Forward completion line
  // e.g. "[COMPLETE] scanDagForward finished. Batches: 3. Blocks: 420. Txs: 900. Elapsed: ..."
  const forwardCompleteMatch = line.match(/scanDagForward finished\. Batches: (\d+)\. Blocks: (\d+)\. Txs: (\d+)\./);
  if (forwardCompleteMatch) {
    stats.batches = Number(forwardCompleteMatch[1] || stats.batches);
    stats.blocksProcessed = Number(forwardCompleteMatch[2] || stats.blocksProcessed);
    stats.txsProcessed = Number(forwardCompleteMatch[3] || stats.txsProcessed);
  }

  // Backward scan logs
  // e.g. "[INFO] Block 123: abcd..."
  const backwardBlockMatch = line.match(/^\[INFO\] Block (\d+):\s*([0-9a-fA-F]{8,})?/);
  if (backwardBlockMatch) {
    stats.blocksProcessed = Math.max(stats.blocksProcessed, Number(backwardBlockMatch[1] || 0));
    const h = (backwardBlockMatch[2] || '').toString();
    stats.lastBlockHashPrefix = h ? h.slice(0, 16) : stats.lastBlockHashPrefix;
  }

  if (line.startsWith('[MATCH]')) {
    stats.matched = true;
  }
}

function renderStats() {
  if (!stats) {
    setStatsLine('');
    return;
  }

  const elapsedSec = Math.max(0, (Date.now() - runStartedAtMs) / 1000);
  const elapsed = elapsedSec.toFixed(elapsedSec < 10 ? 2 : 1);

  if (stats.mode === 'scan_forward') {
    setStatsLine(
      `Live stats: elapsed=${elapsed}s | rpc=${stats.rpcCalls} | batches=${stats.batches} | lastBatch=${stats.lastBatchSize} | blocks=${stats.blocksProcessed || '?'} | txs=${stats.txsProcessed || '?'}${stats.matched ? ' | MATCH' : ''}`
    );
    return;
  }

  if (stats.mode === 'scan_backward') {
    setStatsLine(
      `Live stats: elapsed=${elapsed}s | rpc=${stats.rpcCalls} | blocks=${stats.blocksProcessed}${stats.lastBlockHashPrefix ? ` | last=${stats.lastBlockHashPrefix}...` : ''}${stats.matched ? ' | MATCH' : ''}`
    );
    return;
  }

  setStatsLine(`Live stats: elapsed=${elapsed}s | rpc=${stats.rpcCalls}${stats.matched ? ' | MATCH' : ''}`);
}

function parseOptionalNumber(value, { allowEmpty = true } = {}) {
  const s = (value ?? '').toString().trim();
  if (allowEmpty && s.length === 0) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function cleanPrintableAscii(s) {
  if (typeof s !== 'string' || s.length === 0) return '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7E) out += s[i];
  }
  return out;
}

function decodeHexUtf8(hex) {
  if (typeof hex !== 'string' || hex.length === 0) return '';
  let h = hex;
  if (h.startsWith('0x')) h = h.slice(2);
  if ((h.length % 2) !== 0) return '';
  if (typeof TextDecoder !== 'function') return '';

  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(h.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) return '';
    bytes[i] = byte;
  }

  try {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(bytes);
  } catch {
    try {
      const decoder = new TextDecoder();
      return decoder.decode(bytes);
    } catch {
      return '';
    }
  }
}

function getBlockHash(block) {
  return (block?.hash || block?.header?.hash || '').toString();
}

export async function handleConnectClick() {
  const url = elements.getNodeInput().value.trim();
  const networkId = elements.getNetworkInput().value.trim();
  const usePublicResolver = elements.getPublicResolverCheckbox().checked;

  setStatus('Connecting...');
  try {
    kaspaClient = usePublicResolver ? await connect(null, networkId) : await connect(url, networkId);
    setStatus('Connected');
    appendLog(`[OK] Connected (network=${networkId}${usePublicResolver ? ', resolver' : `, node=${url || '(empty)'}`}).`);
  } catch (err) {
    kaspaClient = null;
    const msg = err?.message ? err.message : String(err);
    setStatus(`Connection failed: ${msg}`);
    appendLog(`[ERROR] Connection failed: ${msg}`);
  }
}

export function handleModeChange() {
  const mode = elements.getModeSelect().value;
  elements.getForwardOptions().style.display = (mode === 'scan_forward') ? 'block' : 'none';
  elements.getBackwardOptions().style.display = (mode === 'scan_backward') ? 'block' : 'none';
}

export function handleClearClick() {
  elements.getLogDiv().textContent = '';
  setResult('');
  setStatus('');
  stopStatsTimer();
  stats = null;
  setStatsLine('');
}

export async function handleRunClick() {
  if (!kaspaClient) {
    setResult('Connect first.');
    return;
  }

  const mode = elements.getModeSelect().value;
  const startHash = elements.getStartHashInput().value.trim();
  const maxSeconds = parseOptionalNumber(elements.getMaxSecondsInput().value, { allowEmpty: false });
  const minTimestamp = parseOptionalNumber(elements.getMinTimestampInput().value, { allowEmpty: true }) ?? 0;

  setResult('');

  if (!/^[a-fA-F0-9]{64}$/.test(startHash)) {
    setResult('Please enter a valid 64-character hex block hash.');
    return;
  }
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) {
    setResult('Max Seconds must be a positive number.');
    return;
  }

  appendLog(`[RUN] mode=${mode}, startHash=${startHash.slice(0, 16)}..., maxSeconds=${maxSeconds}, minTimestamp=${minTimestamp}`);

  resetStats(mode);
  startStatsTimer();

  try {
    if (mode === 'walk_to_present') {
      let blocksSeen = 0;
      const last = { hash: '', blueScore: null, timestamp: null, txCount: null };

      await walkDagToPresent({
        client: kaspaClient,
        startHash,
        maxSeconds,
        minTimestamp,
        logFn: appendLog,
        onBlock: (block) => {
          blocksSeen++;
          last.hash = getBlockHash(block);
          last.blueScore = block?.verboseData?.blueScore ?? block?.header?.blueScore ?? null;
          last.timestamp = Number(block?.verboseData?.timestamp ?? block?.header?.timestamp ?? 0) || null;
          last.txCount = Array.isArray(block?.transactions) ? block.transactions.length : null;
          return false;
        }
      });

      setResult(
        `walkDagToPresent complete\n` +
        `Blocks seen: ${blocksSeen}\n` +
        (last.hash ? `Last block: ${last.hash}\nBlueScore: ${last.blueScore}\nTimestamp: ${last.timestamp}\nTxs: ${last.txCount}` : '')
      );
      return;
    }

    if (mode === 'scan_forward') {
      const searchText = elements.getSearchTextInput().value;
      const matchMode = elements.getMatchModeSelect().value;

      const match = await scanDagForward({
        client: kaspaClient,
        startHash,
        searchText,
        matchMode,
        maxSeconds,
        minTimestamp,
        logFn: appendLog
      });

      if (!match) {
        setResult('scanDagForward: no match found.');
        return;
      }

      setResult(
        `scanDagForward match found\n` +
        `Block: ${match.blockHash}\n` +
        `TxID: ${match.txId}\n` +
        `BlueScore: ${match.blueScore}\n` +
        `Timestamp: ${match.timestamp}\n` +
        `Payload: ${match.payload}\n` +
        `Payload Hex: ${match.pPayloadHex}`
      );
      return;
    }

    if (mode === 'scan_backward') {
      const targetType = elements.getBackwardTargetTypeSelect().value;
      const targetValue = elements.getBackwardTargetValueInput().value.trim();
      const maxDepthRaw = parseOptionalNumber(elements.getMaxDepthInput().value, { allowEmpty: true });
      const maxDepth = (maxDepthRaw == null) ? Infinity : maxDepthRaw;

      if (targetValue.length === 0) {
        setResult('Target Value is required for scanDagBackward.');
        return;
      }

      const matchFn = (block, tx) => {
        const blockHash = getBlockHash(block);

        if (targetType === 'blockHash') {
          return blockHash === targetValue;
        }

        if (targetType === 'txid') {
          if (!tx) return false;
          return (tx?.verboseData?.transactionId || '') === targetValue;
        }

        // payload (decoded contains)
        if (!tx) return false;
        const payloadHex = tx?.payload;
        if (typeof payloadHex !== 'string' || payloadHex.length === 0) return false;

        const decoded = decodeHexUtf8(payloadHex);
        if (!decoded) return false;
        const cleaned = cleanPrintableAscii(decoded);
        if (!cleaned) return false;
        return cleaned.toLowerCase().includes(targetValue.toLowerCase());
      };

      const match = await scanDagBackward({
        client: kaspaClient,
        startHash,
        matchFn,
        maxSeconds,
        maxDepth,
        logFn: appendLog
      });

      if (!match) {
        setResult('scanDagBackward: no match found.');
        return;
      }

      const blockHash = getBlockHash(match.block);
      const txId = match.tx?.verboseData?.transactionId || null;

      setResult(
        `scanDagBackward match found\n` +
        `Block: ${blockHash}\n` +
        (txId ? `TxID: ${txId}\n` : 'TxID: (block match)\n')
      );
      return;
    }

    setResult(`Unknown mode: ${mode}`);
  } catch (err) {
    const msg = err?.message ? err.message : String(err);
    appendLog(`[ERROR] ${msg}`);
    setResult(`Error: ${msg}`);
  } finally {
    renderStats();
    stopStatsTimer();
  }
}
