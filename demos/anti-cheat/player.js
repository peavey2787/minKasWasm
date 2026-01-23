// player.js - Player game section with move tracking and Merkle anchoring

import { $, $$ } from './dom_elements.js';
import { state, resetPlayerState } from './state.js';
import { setStatus, log, createGrid } from './utils.js';
import { MerkleTree, hashLeafSync, sha256Hex, merkleRootSha256Hex } from './merkle.js';

const MAX_PAYLOAD_BYTES = 32 * 1024;

function utf8ByteLen(s) {
  try {
    return new TextEncoder().encode(String(s ?? '')).length;
  } catch {
    return String(s ?? '').length;
  }
}

function enqueueAnchor(obj, root) {
  if (!obj || !root) return;
  state.anchorBacklog.push({ obj, root });

  const max = state.anchorBacklogMax ?? 25;
  if (state.anchorBacklog.length > max) {
    state.anchorBacklog = state.anchorBacklog.slice(state.anchorBacklog.length - max);
    log('anchorTxPanel', `⚠ backlog capped at ${max} anchors (oldest dropped).`);
  }
}

function buildPayload(prefix, payloadObj) {
  const payload = `${prefix}:${JSON.stringify(payloadObj)}`;
  if (utf8ByteLen(payload) > MAX_PAYLOAD_BYTES) return null;
  return payload;
}

function buildBundledPayload(prefix, sessionId, anchors) {
  // Single schema: either a single anchor object, or a bundle with {sid, anchors:[...]}
  if (!Array.isArray(anchors) || anchors.length === 0) return null;
  if (anchors.length === 1) return buildPayload(prefix, anchors[0].obj);
  return buildPayload(prefix, { sid: sessionId, anchors: anchors.map((a) => a.obj) });
}

// Generate a random session ID
function newSessionId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function setPlayerSessionBadge() {
  const el = $('playerSessionBadge');
  if (el) el.textContent = `session: ${state.sessionId ? state.sessionId.slice(0, 8) : '--'}`;
}

function updatePlayerGrid() {
  const cells = $$('#playerGrid .grid-cell');
  cells.forEach(cell => {
    cell.classList.remove('player', 'trail');
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    if (x === state.playerPos.x && y === state.playerPos.y) {
      cell.classList.add('player');
    }
  });
}

function packMoveChar(direction) {
  return direction === 'UP' ? 'U'
    : direction === 'DOWN' ? 'D'
    : direction === 'LEFT' ? 'L'
    : direction === 'RIGHT' ? 'R'
    : '';
}

function recordMove(direction) {
  const now = Date.now();
  const ch = packMoveChar(direction);
  if (!ch) return;

  const move = {
    direction,
    x: state.playerPos.x,
    y: state.playerPos.y,
    timestamp: now,
  };
  state.moveLog.push(move);

  // Timing for latency measurement
  if (state.roundT0 == null) state.roundT0 = now;
  const dt = now - state.roundT0;

  if (state.roundSeq0 == null) state.roundSeq0 = state.moveSeq;

  state.roundMovesPacked += ch;
  state.roundMoveDts.push(dt);

  const seq = state.moveSeq++;

  // Add to local Merkle tree for UI display
  const moveHash = hashLeafSync(JSON.stringify(move));
  if (!state.merkleTree) {
    state.merkleTree = new MerkleTree();
  }
  state.merkleTree.addLeaf(moveHash);

  log('moveLogPanel', `#${seq} [${direction}] → (${move.x}, ${move.y}) dt=${dt}ms`);
  log('merkleTreePanel', `Local Root: ${state.merkleTree.getRoot() || 'computing...'}`);
}

function handlePlayerKeydown(e) {
  if (!state.playerActive) return;

  let dir = null;
  switch (e.key.toLowerCase()) {
    case 'arrowup':
    case 'w':
      if (state.playerPos.y > 0) {
        state.playerPos.y--;
        dir = 'UP';
      }
      break;
    case 'arrowdown':
    case 's':
      if (state.playerPos.y < 9) {
        state.playerPos.y++;
        dir = 'DOWN';
      }
      break;
    case 'arrowleft':
    case 'a':
      if (state.playerPos.x > 0) {
        state.playerPos.x--;
        dir = 'LEFT';
      }
      break;
    case 'arrowright':
    case 'd':
      if (state.playerPos.x < 9) {
        state.playerPos.x++;
        dir = 'RIGHT';
      }
      break;
  }

  if (dir) {
    e.preventDefault();
    recordMove(dir);
    updatePlayerGrid();
  }
}

async function buildAnchorPayload() {
  if (!state.sessionId) return null;
  if (!state.roundMovesPacked || state.roundMovesPacked.length === 0) return null;

  const prefix = $('payloadPrefix')?.value || 'anticheat:move';
  const prev = state.anchorPrevRoot ?? 'GENESIS';
  const t0 = state.roundT0 ?? Date.now();
  const moves = state.roundMovesPacked;
  const dts = state.roundMoveDts.slice();
  const seq0 = state.roundSeq0 ?? 0;

  // Merkle-chain leaves commit to prev_root + (move + timing + index)
  const leafHexes = [];
  leafHexes.push(await sha256Hex(`prev:${prev}`));
  for (let i = 0; i < moves.length; i++) {
    leafHexes.push(await sha256Hex(`m:${moves[i]}:dt:${dts[i]}:i:${i}`));
  }
  const root = await merkleRootSha256Hex(leafHexes);
  if (!root) return null;

  const payloadObj = {
    sid: state.sessionId,
    round: state.anchorRound,
    prev_root: prev,
    root,
    startX: state.playerStartPos.x,
    startY: state.playerStartPos.y,
    t0,
    seq0,
    moves,
    dts,
  };

  return { prefix, payload: `${prefix}:${JSON.stringify(payloadObj)}`, obj: payloadObj, root };
}

async function anchorToKaspa() {
  if (!state.walletReady) return;
  if (state.anchorInFlight) return;

  // If we have a new batch, convert it into an anchor and enqueue it immediately.
  // This guarantees the next successful tx can replay missed anchors.
  const built = await buildAnchorPayload();
  if (built) {
    const { obj, root } = built;

    enqueueAnchor(obj, root);

    // Roll the Merkle-chain forward locally (even if we can't send yet)
    state.anchorPrevRoot = root;
    state.anchorRound += 1;

    // Clear batch so we don't enqueue duplicates
    state.roundMovesPacked = '';
    state.roundMoveDts = [];
    state.roundT0 = null;
    state.roundSeq0 = null;

    log('anchorTxPanel', `↺ queued anchor round=${obj.round} moves=${obj.moves.length} root=${root.slice(0, 16)}... backlog=${state.anchorBacklog.length}`);
  }

  // Nothing queued and nothing built
  if (!state.anchorBacklog || state.anchorBacklog.length === 0) return;

  const prefix = $('payloadPrefix')?.value || 'anticheat:move';
  const sessionId = state.sessionId;

  // Try to include as many queued anchors as will fit.
  let countToSend = state.anchorBacklog.length;
  let payload = null;
  while (countToSend > 0) {
    payload = buildBundledPayload(prefix, sessionId, state.anchorBacklog.slice(0, countToSend));
    if (payload) break;
    countToSend -= 1;
  }

  if (!payload) {
    log('anchorTxPanel', `✗ Anchor payload too large even for 1 anchor. Try smaller batches / fewer moves per interval.`);
    return;
  }

  try {
    state.anchorInFlight = true;
    const sending = state.anchorBacklog.slice(0, countToSend);
    const last = sending[sending.length - 1];
    log('anchorTxPanel', `Anchoring bundle: ${sending.length} anchor(s) sid=${sessionId ? sessionId.slice(0, 8) : '--'}...`);

    await state.portal.send({
      amount: '0.2',
      toAddress: state.walletAddress,
      payload,
    });

    // Success: drop sent anchors from backlog.
    state.anchorBacklog = state.anchorBacklog.slice(countToSend);

    log('anchorTxPanel', `✓ Anchored bundle up to root: ${String(last?.root || '').slice(0, 16)}... remaining backlog=${state.anchorBacklog.length}`);
  } catch (err) {
    log('anchorTxPanel', `✗ Anchor failed: ${err.message}`);
  } finally {
    state.anchorInFlight = false;
  }
}

export function startPlayer() {
  if (!state.connected) {
    alert('Connect to a node first!');
    return;
  }

  resetPlayerState();

  // New session each game
  state.sessionId = newSessionId();
  state.playerStartPos = { x: 4, y: 4 };
  state.playerPos = { ...state.playerStartPos };

  setPlayerSessionBadge();

  state.playerActive = true;
  state.anchorInterval = parseInt($('anchorInterval').value) || 250;

  createGrid('playerGrid', 'grid-cell');
  updatePlayerGrid();
  log('moveLogPanel', `Game started! Session: ${state.sessionId.slice(0, 8)}`, true);
  log('merkleTreePanel', 'Merkle tree initialized.', true);
  log('anchorTxPanel', `Anchoring every ${state.anchorInterval}ms`, true);

  document.addEventListener('keydown', handlePlayerKeydown);

  // Notify spectator of new session (if on same page)
  window.dispatchEvent(new CustomEvent('antiCheat:newSession', {
    detail: { sessionId: state.sessionId, startPos: state.playerStartPos }
  }));

  // Start anchor timer
  if (state.walletReady) {
    state.anchorTimer = setInterval(anchorToKaspa, state.anchorInterval);
  } else {
    log('anchorTxPanel', 'Anchoring disabled (wallet not ready). Connect again or check console.', true);
  }

  setStatus('playerStatus', 'Playing', 'connected');
  $('startPlayerBtn').disabled = true;
  $('stopPlayerBtn').disabled = false;
}

export function stopPlayer() {
  state.playerActive = false;
  document.removeEventListener('keydown', handlePlayerKeydown);

  if (state.anchorTimer) {
    clearInterval(state.anchorTimer);
    state.anchorTimer = null;
  }

  setStatus('playerStatus', 'Stopped', 'disconnected');
  $('startPlayerBtn').disabled = false;
  $('stopPlayerBtn').disabled = true;
}

export function initPlayer() {
  createGrid('playerGrid', 'grid-cell');
  $('startPlayerBtn').addEventListener('click', startPlayer);
  $('stopPlayerBtn').addEventListener('click', stopPlayer);
}
