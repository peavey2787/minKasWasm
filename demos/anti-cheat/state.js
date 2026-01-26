// state.js - Centralized state for anti-cheat demo
// Uses the global kaspaPortal singleton - no local instantiation

import { kaspaPortal } from '../../wrapper/kaspaPortal.js';
import { MerkleTree } from './merkle.js';

// Export portal reference for modules that import state
export const portal = kaspaPortal;

export const state = {
  // Connection - portal is accessed via the singleton, not stored here
  connected: false,
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
  vrfProof: null,
  nistResults: [],

  // Player state
  playerActive: false,
  playerPos: { x: 4, y: 4 },
  moveLog: [],
  merkleTree: null,
  anchorInterval: 250,
  anchorTimer: null,

  // KKTP State
  kktp: {
    identity: null, // { priv, pub }
    session: null,  // { priv, pub }
    peerIdentity: null,
    peerSession: null,
    kSession: null, // Uint8Array
    mailboxId: null, // hex
    seq: 0
  },
  spectatorSessionEstablished: false,
  spectatorHandshakeLogged: false,

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
  spectatorBuffer: new Map(), // Buffer for out-of-order KKTP messages: Map<seq, {obj, meta, opts}>
  spectatorSeenKeys: new Set(),

  // Latency stats (ms)
  spectatorLatency: {
    last: null,
    avg: null,
    max: null,
    count: 0,
    sum: 0
  },

  // Game Browser state - persistent across scanning cycles
  // Additive: sessions are never removed, only added or updated
  foundSessions: new Map(),
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

  // Reset KKTP state for spectator
  state.kktp = {
    identity: null,
    session: null,
    peerIdentity: null,
    peerSession: null,
    kSession: null,
    mailboxId: null,
    seq: 0
  };
  state.spectatorSessionEstablished = false;
  state.spectatorHandshakeLogged = false;

  // Chain ordering state
  state.spectatorSessionId = null;
  state.spectatorExpectedPrevRoot = 'GENESIS';
  state.spectatorExpectedRound = 0;
  state.spectatorLastSeq = -1;
  state.spectatorPendingByPrevRoot = new Map();
  state.spectatorBuffer = new Map();
  state.spectatorSeenKeys = new Set();

  // Latency stats
  state.spectatorLatency = { last: null, avg: null, max: null, count: 0, sum: 0 };

  // NOTE: foundSessions is NOT reset here - it's persistent and additive

  if (state.spectatorTimer) {
    clearInterval(state.spectatorTimer);
    state.spectatorTimer = null;
  }
}

/**
 * Add or update a session in the persistent game browser list.
 * Additive: never removes sessions, only adds/updates.
 * @param {Object} session - { sid, meta, timestamp }
 * @returns {boolean} - true if this was a new session
 */
export function addFoundSession(session) {
  if (!session || !session.sid) return false;
  const existed = state.foundSessions.has(session.sid);

  // Update if newer or if not seen before
  const existing = state.foundSessions.get(session.sid);
  if (!existing || (session.timestamp && session.timestamp > (existing.timestamp || 0))) {
    state.foundSessions.set(session.sid, session);
  }

  return !existed;
}

/**
 * Get all found sessions sorted by timestamp (newest first).
 * @returns {Array} - Sorted array of session objects
 */
export function getFoundSessionsSorted() {
  return Array.from(state.foundSessions.values())
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}
