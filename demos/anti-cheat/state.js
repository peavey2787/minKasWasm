// state.js - Centralized state for anti-cheat demo

import { MerkleTree } from './merkle.js';

export const state = {
  // Connection
  connected: false,
  client: null,
  scanner: null,
  walletAddress: null,
  walletReady: false,

  // Indexer event routing (no buffering here; the indexer owns storage)
  indexerUpdateHandlers: new Set(),

  // VRF data
  kaspaBlocks: [],
  btcBlocks: [],
  qrngData: [],
  foldedOutput: null,
  nistResults: [],

  // Player state
  playerActive: false,
  playerPos: { x: 4, y: 4 },
  moveLog: [],
  merkleTree: null,
  anchorInterval: 250,
  anchorTimer: null,

  // Merkle-chain anchoring (bounded, continuous)
  anchorRound: 0,
  anchorPrevRoot: null,
  roundMovesPacked: '',
  anchorInFlight: false,

  // Spectator state
  spectatorActive: false,
  spectatorPos: { x: 4, y: 4 },
  spectatorMoves: [],
  seenMerkleRoots: new Set(),
  spectatorTimer: null,
  spectatorLastRoot: null,
  spectatorLastRound: null,
};

export function addIndexerUpdateHandler(handler) {
  if (typeof handler !== 'function') return;
  state.indexerUpdateHandlers.add(handler);
}

export function removeIndexerUpdateHandler(handler) {
  state.indexerUpdateHandlers.delete(handler);
}

// Reset player state
export function resetPlayerState() {
  state.playerActive = false;
  state.playerPos = { x: 4, y: 4 };
  state.moveLog = [];
  state.merkleTree = new MerkleTree();
  state.anchorRound = 0;
  state.anchorPrevRoot = null;
  state.roundMovesPacked = '';
  state.anchorInFlight = false;
  if (state.anchorTimer) {
    clearInterval(state.anchorTimer);
    state.anchorTimer = null;
  }
}

// Reset spectator state
export function resetSpectatorState() {
  state.spectatorActive = false;
  state.spectatorPos = { x: 4, y: 4 };
  state.spectatorMoves = [];
  state.seenMerkleRoots = new Set();
  state.spectatorLastRoot = null;
  state.spectatorLastRound = null;
  if (state.spectatorTimer) {
    clearInterval(state.spectatorTimer);
    state.spectatorTimer = null;
  }
}
