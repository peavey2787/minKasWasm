// spectator.js - Spectator mode: watch player moves replayed from blockchain

import { $, $$ } from './dom_elements.js';
import { state, resetSpectatorState, addIndexerUpdateHandler, removeIndexerUpdateHandler } from './state.js';
import { setStatus, log, createGrid } from './utils.js';
import { sha256Hex, merkleRootSha256Hex } from './merkle.js';

const INDEXER_EVENT = Object.freeze({
  MATCHING_TRANSACTION_IN_MEMORY: 'matching-transaction-in-memory',
  MATCHING_TRANSACTION_CACHED: 'matching-transaction-cached',
});

let spectatorPos = { x: 5, y: 5 };
let indexerHandler = null;
let seenTxids = new Set();

function updateSpectatorGrid() {
  const cells = $$('#spectatorGrid .grid-cell');
  cells.forEach(cell => {
    cell.classList.remove('spectator', 'trail');
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    if (x === spectatorPos.x && y === spectatorPos.y) {
      cell.classList.add('spectator');
    }
  });
}

function applyMove(direction) {
  switch (direction) {
    case 'UP':
      if (spectatorPos.y > 0) spectatorPos.y--;
      break;
    case 'DOWN':
      if (spectatorPos.y < 9) spectatorPos.y++;
      break;
    case 'LEFT':
      if (spectatorPos.x > 0) spectatorPos.x--;
      break;
    case 'RIGHT':
      if (spectatorPos.x < 9) spectatorPos.x++;
      break;
  }
  updateSpectatorGrid();
}

function tryParseAnchorPayload(payloadStr, prefix) {
  const expectedStart = `${prefix}:`;
  if (!payloadStr || !payloadStr.startsWith(expectedStart)) return null;
  const json = payloadStr.slice(expectedStart.length);
  try {
    const obj = JSON.parse(json);
    if (!obj || obj.v !== 1) return null;
    if (typeof obj.root !== 'string') return null;
    if (typeof obj.prev_root !== 'string') return null;
    if (typeof obj.moves !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

async function verifyAnchorPayload(obj) {
  const prev = obj.prev_root || 'GENESIS';
  const moves = obj.moves || '';
  const leafHexes = [];
  leafHexes.push(await sha256Hex(`prev:${prev}`));
  for (const ch of moves) {
    leafHexes.push(await sha256Hex(`move:${ch}`));
  }
  const computed = await merkleRootSha256Hex(leafHexes);
  return computed === obj.root;
}

function replayMovesPacked(movesPacked) {
  for (const ch of movesPacked) {
    const dir = ch === 'U' ? 'UP' : ch === 'D' ? 'DOWN' : ch === 'L' ? 'LEFT' : ch === 'R' ? 'RIGHT' : null;
    if (dir) applyMove(dir);
  }
}

async function handleMatchObject(matchObj, prefix) {
  if (!matchObj) return;

  const txid = matchObj.txid;
  if (txid && seenTxids.has(txid)) return;
  if (txid) seenTxids.add(txid);

  const payloadStr = typeof matchObj.decodedPayload === 'string' ? matchObj.decodedPayload : null;
  if (!payloadStr) return;

  const obj = tryParseAnchorPayload(payloadStr, prefix);
  if (!obj) return;

  const merkleRoot = obj.root;
  if (!merkleRoot) return;

  if (state.seenMerkleRoots.has(merkleRoot)) return;

  const ok = await verifyAnchorPayload(obj);
  const blueScoreStr = (typeof matchObj.blueScore === 'bigint') ? matchObj.blueScore.toString() : String(matchObj.blueScore ?? '');

  state.seenMerkleRoots.add(merkleRoot);
  replayMovesPacked(obj.moves);

  if (ok) {
    if (state.spectatorLastRoot && obj.prev_root !== state.spectatorLastRoot) {
      log('spectatorLogPanel', `WARN chain break? prev_root=${String(obj.prev_root).slice(0, 12)}... expected=${String(state.spectatorLastRoot).slice(0, 12)}...`);
    }
    state.spectatorLastRoot = obj.root;
    state.spectatorLastRound = obj.round;
  }

  log('spectatorLogPanel', `${ok ? '✓' : '✗'} anchor round=${obj.round} moves=${obj.moves.length} root=${merkleRoot.slice(0, 16)}... (blueScore=${blueScoreStr})`);
}

async function initialBackfillFromIndexer(prefix) {
  if (!state.scanner?.indexer) return;

  // First: in-memory (recent, not yet flushed)
  try {
    const inMem = state.scanner.indexer.getAllMatchingTransactions?.() || [];
    inMem
      .slice()
      .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0))
      .forEach(tx => { handleMatchObject(tx, prefix); });
  } catch (e) {
    // ignore
  }

  // Then: cached (IndexedDB)
  try {
    const cached = await state.scanner.indexer.getAllCachedMatchingTransactions?.();
    (cached || [])
      .slice()
      .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0))
      .forEach(tx => { handleMatchObject(tx, prefix); });
  } catch (e) {
    // ignore
  }
}

export function startSpectator() {
  if (!state.connected) {
    alert('Connect to a node first!');
    return;
  }

  if (!state.scanner) {
    alert('Scanner not ready yet. Connect first.');
    return;
  }

  resetSpectatorState();
  spectatorPos = { x: 5, y: 5 };
  state.spectatorActive = true;
  state.seenMerkleRoots = new Set();
  seenTxids = new Set();

  const prefix = $('payloadPrefix').value || 'anticheat:move';
  // Ensure scanner is matching payloads so matching txs are indexed.
  state.scanner.prefix = prefix;

  createGrid('spectatorGrid', 'grid-cell spectator-mode');
  updateSpectatorGrid();
  log('spectatorLogPanel', 'Spectator mode started. Watching for move anchors...', true);

  // Live updates: use the indexer event stream (scanner for "now", indexer for storage)
  indexerHandler = (evt) => {
    if (!state.spectatorActive) return;
    if (!evt || !evt.type) return;
    if (evt.type === INDEXER_EVENT.MATCHING_TRANSACTION_IN_MEMORY) {
      handleMatchObject(evt.data, prefix);
      return;
    }
    if (evt.type === INDEXER_EVENT.MATCHING_TRANSACTION_CACHED) {
      const batch = Array.isArray(evt.data) ? evt.data : [];
      for (const item of batch) handleMatchObject(item, prefix);
    }
  };
  addIndexerUpdateHandler(indexerHandler);

  // Backfill from indexer ("later") so the spectator can catch up.
  initialBackfillFromIndexer(prefix);

  setStatus('spectatorStatus', 'Watching', 'connected');
  $('startSpectatorBtn').disabled = true;
  $('stopSpectatorBtn').disabled = false;
}

export function stopSpectator() {
  state.spectatorActive = false;

  if (indexerHandler) {
    removeIndexerUpdateHandler(indexerHandler);
    indexerHandler = null;
  }

  if (state.spectatorTimer) {
    clearInterval(state.spectatorTimer);
    state.spectatorTimer = null;
  }

  setStatus('spectatorStatus', 'Stopped', 'disconnected');
  $('startSpectatorBtn').disabled = false;
  $('stopSpectatorBtn').disabled = true;
}

// For live player sync (when player and spectator are both active)
export function syncWithPlayer(move) {
  if (!state.spectatorActive) return;
  applyMove(move.direction);
  log('spectatorLogPanel', `[LIVE] ${move.direction} → (${move.x}, ${move.y})`);
}

export function initSpectator() {
  createGrid('spectatorGrid', 'grid-cell spectator-mode');
  $('startSpectatorBtn').addEventListener('click', startSpectator);
  $('stopSpectatorBtn').addEventListener('click', stopSpectator);
}
