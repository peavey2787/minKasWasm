import { state } from '../state.js';
import { log } from '../utils.js';
import { MerkleTree, hashLeafSync } from '../merkle.js';

export function newSessionId() {
  const b = new Uint8Array(16); // 128-bit entropy for KKTP sid
  crypto.getRandomValues(b);
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function packMoveChar(direction) {
  return direction === 'UP' ? 'U'
    : direction === 'DOWN' ? 'D'
    : direction === 'LEFT' ? 'L'
    : direction === 'RIGHT' ? 'R'
    : '';
}

export async function recordMove(direction) {
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

  const merkleRoot = await state.merkleTree.getRoot();

  log('moveLogPanel', `#${seq} [${direction}] → (${move.x}, ${move.y}) dt=${dt}ms`);
  log('merkleTreePanel', `Local Root: ${ merkleRoot || 'computing...'}`);
}