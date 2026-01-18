// player.js - Player game section with move tracking and Merkle anchoring

import { send } from '../../wrapper/wallet_service.js';
import { $, $$ } from './dom_elements.js';
import { state, resetPlayerState } from './state.js';
import { setStatus, log, createGrid, showInsufficientFundsModal } from './utils.js';
import { MerkleTree, hashLeafSync, sha256Hex, merkleRootSha256Hex } from './merkle.js';

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

function recordMove(direction) {
  const move = {
    direction,
    x: state.playerPos.x,
    y: state.playerPos.y,
    timestamp: Date.now(),
  };
  state.moveLog.push(move);

  // Pack moves for bounded Merkle-chain anchoring (UDLR).
  const packed =
    direction === 'UP' ? 'U' :
    direction === 'DOWN' ? 'D' :
    direction === 'LEFT' ? 'L' :
    direction === 'RIGHT' ? 'R' : '';
  if (packed) state.roundMovesPacked += packed;

  // Add to Merkle tree
  const moveHash = hashLeafSync(JSON.stringify(move));
  if (!state.merkleTree) {
    state.merkleTree = new MerkleTree();
  }
  state.merkleTree.addLeaf(moveHash);

  log('moveLogPanel', `[${direction}] → (${move.x}, ${move.y})`);
  log('merkleTreePanel', `Local Root: ${state.merkleTree.getRoot() || 'computing...'}\nAnchors commit to prev_root + packed moves (Merkle-chain).`);
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

async function anchorToKaspa() {
  if (!state.walletReady) return;
  if (state.anchorInFlight) return;

  // No new moves since last anchor.
  if (!state.roundMovesPacked || state.roundMovesPacked.length === 0) return;

  const prefix = $('payloadPrefix').value || 'anticheat:move';
  const prev = state.anchorPrevRoot ?? 'GENESIS';

  // Merkle-chain leaves:
  // Leaf 0: hash(prev_root)
  // Leaf i: hash(moveChar)
  const leafHexes = [];
  leafHexes.push(await sha256Hex(`prev:${prev}`));
  for (const ch of state.roundMovesPacked) {
    leafHexes.push(await sha256Hex(`move:${ch}`));
  }
  const root = await merkleRootSha256Hex(leafHexes);
  if (!root) return;

  const payloadObj = {
    v: 1,
    round: state.anchorRound,
    prev_root: prev,
    root,
    moves: state.roundMovesPacked,
    t: Date.now(),
  };

  const payload = `${prefix}:${JSON.stringify(payloadObj)}`;

  const requiredKAS = 0.2;
  if (state.walletBalanceMatureNumber != null && state.walletBalanceMatureNumber < requiredKAS) {
    showInsufficientFundsModal({
      requiredKAS,
      balanceKAS: state.walletBalanceMatureKAS,
      address: state.walletAddress,
    });
    return;
  }

  try {
    state.anchorInFlight = true;
    log('anchorTxPanel', `Anchoring round=${payloadObj.round} moves=${payloadObj.moves.length} root=${root.slice(0, 16)}...`);
    await send({
      amount: '0.2',
      toAddress: state.walletAddress,
      payload,
    });

    state.anchorPrevRoot = root;
    state.anchorRound += 1;
    state.roundMovesPacked = '';

    log('anchorTxPanel', `✓ Anchored root: ${root.slice(0, 16)}... (prev_root chained)`);
  } catch (err) {
    log('anchorTxPanel', `✗ Anchor failed: ${err.message}`);

    const msg = String(err?.message ?? err);
    if (/insufficient|not enough|balance|utxo|fund/i.test(msg)) {
      showInsufficientFundsModal({
        requiredKAS: 0.2,
        balanceKAS: state.walletBalanceMatureKAS,
        address: state.walletAddress,
      });
    }
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
  state.playerActive = true;
  state.anchorInterval = parseInt($('anchorInterval').value) || 250;

  createGrid('playerGrid', 'grid-cell');
  updatePlayerGrid();
  log('moveLogPanel', 'Game started! Use arrow keys or WASD.', true);
  log('merkleTreePanel', 'Merkle tree initialized.', true);
  log('anchorTxPanel', `Anchoring every ${state.anchorInterval}ms`, true);

  document.addEventListener('keydown', handlePlayerKeydown);

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
