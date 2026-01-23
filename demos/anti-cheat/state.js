// state.js - Centralized state for anti-cheat demo

import { KaspaPortal } from '../../wrapper/kaspaPortal.js';
import { MerkleTree } from './merkle.js';

export const state = {
  // Connection
  connected: false,
  portal: new KaspaPortal(),
  client: null,
  scanner: null,
  walletAddress: null,
  walletReady: false,
  walletBalanceMatureKAS: null,
  walletBalanceMatureNumber: null,

  // UI gating: show the "insufficient funds" modal only once at connect-time
  // (and only if mature balance is 0). Never show it during gameplay.
  noFundsModalShown: false,
  noFundsModalEligibleUntilMs: 0,

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

  // Session (new each "Start Game")
  sessionId: null,
  playerStartPos: { x: 4, y: 4 },
  moveSeq: 0,

  // Merkle-chain anchoring (bounded, continuous)
  anchorRound: 0,
  anchorPrevRoot: null,
  roundMovesPacked: '',
  roundMoveDts: [],         // ms deltas from roundT0
  roundT0: null,            // ms epoch of first move in this batch
  roundSeq0: null,          // first move sequence in this batch
  anchorInFlight: false,

  // Anchor backlog (to prevent missed moves): if an anchor tx fails, keep it here
  // and include it as a prior anchor in the next successful tx payload.
  anchorBacklog: [],        // array of { obj, root }
  anchorBacklogMax: 25,

  // Spectator state
  spectatorActive: false,
  spectatorPos: { x: 4, y: 4 },
  spectatorMoves: [],
  seenMerkleRoots: new Set(),
  spectatorTimer: null,
  spectatorLastRoot: null,
  spectatorLastRound: null,

  // Spectator chain state (ordering anchors by prev_root)
  spectatorSessionId: null,
  spectatorExpectedPrevRoot: null,
  spectatorExpectedRound: 0,
  spectatorLastSeq: -1,
  spectatorPendingByPrevRoot: new Map(),
  spectatorSeenKeys: new Set(),

  // Latency stats (ms)
  spectatorLatency: {
    last: null,
    avg: null,
    max: null,
    count: 0,
    sum: 0
  },
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
  state.moveSeq = 0;
  state.anchorRound = 0;
  state.anchorPrevRoot = null;
  state.roundMovesPacked = '';
  state.roundMoveDts = [];
  state.roundT0 = null;
  state.roundSeq0 = null;
  state.anchorInFlight = false;
  state.anchorBacklog = [];
  state.anchorBacklogMax = 25;
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

  // Chain ordering state
  state.spectatorSessionId = null;
  state.spectatorExpectedPrevRoot = 'GENESIS';
  state.spectatorExpectedRound = 0;
  state.spectatorLastSeq = -1;
  state.spectatorPendingByPrevRoot = new Map();
  state.spectatorSeenKeys = new Set();

  // Latency stats
  state.spectatorLatency = { last: null, avg: null, max: null, count: 0, sum: 0 };

  if (state.spectatorTimer) {
    clearInterval(state.spectatorTimer);
    state.spectatorTimer = null;
  }
}
