// player.js - Player game section with move tracking and Merkle anchoring

import { $, $$ } from './dom_elements.js';
import { state, resetPlayerState } from './state.js';
import { setStatus, log, createGrid } from './utils.js';
import { MerkleTree, hashLeafSync, sha256Hex, merkleRootSha256Hex } from './merkle.js';
import * as KKTP from './kktp_lib.js';

const MAX_PAYLOAD_BYTES = 32 * 1024;

function utf8ByteLen(s) {
  try {
    return new TextEncoder().encode(String(s ?? '')).length;
  } catch {
    return String(s ?? '').length;
  }
}

// Generate a random session ID
function newSessionId() {
  const b = new Uint8Array(16); // 128-bit entropy for KKTP sid
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

  // P2P Relay: Send move immediately for visual sync (simulated via event)
  window.dispatchEvent(new CustomEvent('antiCheat:move', {
    detail: move
  }));
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

async function buildKKTPMessage() {
  if (!state.sessionId) return null;
  if (!state.roundMovesPacked || state.roundMovesPacked.length === 0) return null;

  // Construct game data payload
  const gameData = {
    sid: state.sessionId,
    t0: state.roundT0 ?? Date.now(),
    moves: state.roundMovesPacked,
    dts: state.roundMoveDts.slice(),
    seq0: state.roundSeq0 ?? 0
  };

  // Encrypt using KKTP
  // Atomic Sequence: Do not increment state.kktp.seq yet. Use next sequence for encryption.
  const msg = KKTP.encryptMessage(
    state.kktp.kSession,
    state.kktp.mailboxId,
    "AtoB", // Player is Initiator (A)
    state.kktp.seq + 1,
    gameData
  );

  return msg;
}

async function publishGameLoop() {
  if (!state.walletReady) return;
  if (state.anchorInFlight) return;

  const msg = await buildKKTPMessage();
  if (!msg) return;

  const prefix = $('payloadPrefix')?.value || 'KKTP';
  const payload = KKTP.buildKKTPPayload(prefix + ':', msg);

  try {
    state.anchorInFlight = true;
    log('anchorTxPanel', `Sending KKTP Msg #${msg.seq} (${msg.ciphertext.length / 2} bytes)...`);

    await state.portal.send({
      amount: '0.2',
      toAddress: state.walletAddress,
      payload,
    });
    log('anchorTxPanel', `✓ Sent Msg #${msg.seq}`);

    // Success: Atomic Increment & Clear buffer
    state.kktp.seq++; 
    state.roundMovesPacked = '';
    state.roundMoveDts = [];
    state.roundT0 = null;
    state.roundSeq0 = null;
  } catch (err) {
    log('anchorTxPanel', `✗ Send failed: ${err.message}`);
    // Failure: Keep buffer for retry. 
    // Do NOT increment sequence. Next attempt will reuse the same sequence number.
  } finally {
    state.anchorInFlight = false;
  }
}

async function performKKTPHandshake() {
  log('anchorTxPanel', 'Starting KKTP Handshake...');
  
  // 1. Generate Keys
  state.kktp.identity = await KKTP.generateIdentityKey();
  state.kktp.session = await KKTP.generateSessionKey();
  
  // 1b. Get VRF Value (Public Seed)
  let vrfValue = state.foldedOutput;
  if (!vrfValue) {
      // Generate a random one for demo purposes if user didn't fold
      const rnd = new Uint8Array(32);
      crypto.getRandomValues(rnd);
      vrfValue = KKTP.bytesToHex(rnd);
      log('anchorTxPanel', 'Generated ephemeral VRF value (no folded output found).');
  } else {
      log('anchorTxPanel', 'Using folded VRF output for session key derivation.');
  }

  // 2. Create Discovery Anchor
  const discovery = await KKTP.createDiscoveryAnchor(
    state.sessionId, 
    state.kktp.identity, 
    state.kktp.session,
    { game: "anti-cheat-demo", startX: state.playerStartPos.x, startY: state.playerStartPos.y },
    vrfValue
  );
  
  // 3. Simulate Peer (Responder) for demo purposes
  // In a real app, we would wait for a peer. Here we generate one to allow encryption.
  const peerIdentity = await KKTP.generateIdentityKey();
  const peerSession = await KKTP.generateSessionKey();
  const response = await KKTP.createResponseAnchor(discovery, peerIdentity, peerSession);
  
  // 4. Publish Anchors (Bundled for speed in demo, usually separate)
  const prefix = $('payloadPrefix')?.value || 'KKTP';
  const payload = `${prefix}:ANCHOR:${KKTP.canonicalStringify({ anchors: [discovery, response] })}`;
  
  await state.portal.send({
    amount: '0.2',
    toAddress: state.walletAddress,
    payload
  });
  
  // 5. Derive Session Keys
  // Use public derivation so spectators can also derive keys
  const secrets = KKTP.derivePublicSessionSecrets(vrfValue, state.sessionId, state.kktp.identity.pub, peerIdentity.pub);
  state.kktp.kSession = secrets.kSession;
  state.kktp.mailboxId = secrets.mailboxId;
  
  log('anchorTxPanel', `KKTP Session Established (Public). Mailbox: ${state.kktp.mailboxId.slice(0,8)}...`);
}

export async function startPlayer() {
  if (!state.connected) {
    alert('Connect to a node first!');
    return;
  }

  resetPlayerState();

  // New session each game
  state.sessionId = newSessionId();
  state.playerStartPos = { x: 4, y: 4 };
  state.playerPos = { ...state.playerStartPos };
  state.kktp.seq = 0;

  setPlayerSessionBadge();

  state.playerActive = true;
  state.anchorInterval = parseInt($('anchorInterval').value) || 1250;

  createGrid('playerGrid', 'grid-cell');
  updatePlayerGrid();
  log('moveLogPanel', `Game started! Session: ${state.sessionId.slice(0, 8)}`, true);
  log('merkleTreePanel', 'Merkle tree initialized.', true);
  log('anchorTxPanel', `Syncing every ${state.anchorInterval}ms`, true);

  document.addEventListener('keydown', handlePlayerKeydown);

  // Notify spectator of new session (if on same page)
  window.dispatchEvent(new CustomEvent('antiCheat:newSession', {
    detail: { sessionId: state.sessionId, startPos: state.playerStartPos }
  }));

  // Start anchor timer
  if (state.walletReady) {
    await performKKTPHandshake();
    state.anchorTimer = setInterval(publishGameLoop, state.anchorInterval);
  } else {
    log('anchorTxPanel', 'Wallet not ready. Connect again.', true);
  }

  setStatus('playerStatus', 'Playing', 'connected');
  $('startPlayerBtn').disabled = true;
  $('stopPlayerBtn').disabled = false;
}

export async function stopPlayer() {
  state.playerActive = false;
  document.removeEventListener('keydown', handlePlayerKeydown);

  if (state.anchorTimer) {
    clearInterval(state.anchorTimer);
    state.anchorTimer = null;
  }

  if (state.walletReady && state.kktp.identity) {
    const endAnchor = await KKTP.createSessionEndAnchor(state.sessionId, state.kktp.identity);
    const prefix = $('payloadPrefix')?.value || 'KKTP';
    await state.portal.send({
      amount: '0.2',
      toAddress: state.walletAddress,
      payload: KKTP.buildKKTPPayload(prefix + ':', endAnchor)
    });
    log('anchorTxPanel', 'Session Closed.');
  }

  setStatus('playerStatus', 'Stopped', 'disconnected');
  $('startPlayerBtn').disabled = false;
  $('stopPlayerBtn').disabled = true;
}

export function initPlayer() {
  if (!$('startPlayerBtn')) return; // Guard

  createGrid('playerGrid', 'grid-cell');
  $('startPlayerBtn').addEventListener('click', startPlayer);
  $('stopPlayerBtn').addEventListener('click', stopPlayer);
}
