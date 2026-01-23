// spectator.js - Spectator mode: watch player moves replayed from blockchain
// Uses Merkle-chain ordering to ensure moves are replayed in correct order

import { $, $$ } from './dom_elements.js';
import { state, resetSpectatorState, addIndexerUpdateHandler, removeIndexerUpdateHandler } from './state.js';
import { setStatus, log, createGrid } from './utils.js';
import { sha256Hex, merkleRootSha256Hex } from './merkle.js';

const INDEXER_EVENT = Object.freeze({
  MATCHING_TRANSACTION_IN_MEMORY: 'matching-transaction-in-memory',
  MATCHING_TRANSACTION_CACHED: 'matching-transaction-cached',
});

let indexerHandler = null;
let replayTimers = [];
let replayInProgress = false;

// --- Live catch-up queue (prevents visual skipping when bundled anchors arrive) ---

const LIVE_PACE_MS_PER_ANCHOR_WHEN_BEHIND = 120;
const LIVE_MOVE_STEP_MS_WHEN_BEHIND = 18;

const live = {
  queue: [], // items: { anchorObj, meta }
  processing: false,
  processPromise: null,
  latestRoundSeen: -1,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function ensureBehindBanner() {
  let el = document.getElementById('spectatorBehindBanner');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'spectatorBehindBanner';
  el.className = 'spectator-behind-banner';
  el.textContent = 'Spectator behind…';
  document.body.appendChild(el);
  return el;
}

function setBehindBanner(on, msg) {
  const el = ensureBehindBanner();
  if (msg) el.textContent = msg;
  el.classList.toggle('on', !!on);
}

function getPendingCount() {
  try {
    let n = 0;
    for (const list of state.spectatorPendingByPrevRoot?.values?.() || []) n += list.length;
    return n;
  } catch {
    return 0;
  }
}

function computeBehindState() {
  const queued = live.queue.length;
  const pending = getPendingCount();
  const lastAppliedRound = typeof state.spectatorLastRound === 'number' ? state.spectatorLastRound : -1;
  const latestSeen = typeof live.latestRoundSeen === 'number' ? live.latestRoundSeen : -1;
  const lagRounds = latestSeen >= 0 && lastAppliedRound >= 0 ? Math.max(0, latestSeen - lastAppliedRound) : (queued + pending);
  const behind = (queued + pending) > 0 && lagRounds > 0;
  return { behind, queued, pending, lagRounds };
}

function enqueueLiveAnchor(anchorObj, meta) {
  if (!anchorObj) return;

  const r = typeof anchorObj.round === 'number' ? anchorObj.round : null;
  if (r != null) live.latestRoundSeen = Math.max(live.latestRoundSeen, r);

  live.queue.push({ anchorObj, meta });
  live.queue.sort((a, b) => {
    const ra = typeof a.anchorObj?.round === 'number' ? a.anchorObj.round : Number.MAX_SAFE_INTEGER;
    const rb = typeof b.anchorObj?.round === 'number' ? b.anchorObj.round : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

function takeNextReadyPending() {
  const nextPrev = state.spectatorExpectedPrevRoot;
  const nextList = state.spectatorPendingByPrevRoot.get(nextPrev);
  if (!nextList || nextList.length === 0) return null;

  const idx = nextList.findIndex(x => x.round === state.spectatorExpectedRound);
  if (idx === -1) return null;

  const [next] = nextList.splice(idx, 1);
  if (nextList.length === 0) {
    state.spectatorPendingByPrevRoot.delete(nextPrev);
  }
  return next;
}

function resetLiveQueueUi() {
  live.queue = [];
  live.processing = false;
  live.processPromise = null;
  live.latestRoundSeen = -1;
  try {
    setBehindBanner(false);
  } catch {
    // ignore
  }
}

function startLiveProcessing() {
  if (live.processPromise) return live.processPromise;
  live.processPromise = (async () => {
    if (live.processing) return;
    live.processing = true;
    try {
      while (state.spectatorActive && !replayInProgress) {
        const item = live.queue.shift();
        if (!item) break;

        const { behind, queued, pending, lagRounds } = computeBehindState();
        if (behind) setBehindBanner(true, `Spectator behind… queue=${queued + pending} lag≈${lagRounds} round(s)`);

        await tryAcceptAnchor(item.anchorObj, item.meta, {
          animateMoves: behind,
          moveStepMs: LIVE_MOVE_STEP_MS_WHEN_BEHIND,
        });

        // Apply any pending anchors that became ready, paced for visibility
        while (true) {
          const next = takeNextReadyPending();
          if (!next) break;
          const { behind: stillBehind } = computeBehindState();
          await tryAcceptAnchor(next, null, {
            animateMoves: stillBehind,
            moveStepMs: LIVE_MOVE_STEP_MS_WHEN_BEHIND,
          });
          await nextFrame();
          if (stillBehind) await sleep(LIVE_PACE_MS_PER_ANCHOR_WHEN_BEHIND);
        }

        // Yield so the browser can paint intermediate states
        await nextFrame();

        const after = computeBehindState();
        if (after.behind) {
          await sleep(LIVE_PACE_MS_PER_ANCHOR_WHEN_BEHIND);
        }
      }
    } finally {
      live.processing = false;
      live.processPromise = null;
      setBehindBanner(false);
    }
  })();
  return live.processPromise;
}

// --- UI helpers ---

function setSpectatorBadges() {
  const sEl = $('spectatorSessionBadge');
  const lEl = $('spectatorLatencyBadge');

  if (sEl) {
    sEl.textContent = `session: ${state.spectatorSessionId ? state.spectatorSessionId.slice(0, 8) : '--'}`;
  }

  const lat = state.spectatorLatency;
  if (lEl) {
    if (!lat || !lat.count) {
      lEl.textContent = 'latency: --';
    } else {
      lEl.textContent = `latency: ${Math.round(lat.last)}ms | avg ${Math.round(lat.avg)}ms | max ${Math.round(lat.max)}ms`;
    }
  }
}

function updateSpectatorGrid() {
  const cells = $$('#spectatorGrid .grid-cell');
  cells.forEach(cell => {
    cell.classList.remove('spectator', 'trail');
    const x = parseInt(cell.dataset.x, 10);
    const y = parseInt(cell.dataset.y, 10);
    if (x === state.spectatorPos.x && y === state.spectatorPos.y) {
      cell.classList.add('spectator');
    }
  });
}

function applyMove(direction) {
  switch (direction) {
    case 'UP':
      if (state.spectatorPos.y > 0) state.spectatorPos.y--;
      break;
    case 'DOWN':
      if (state.spectatorPos.y < 9) state.spectatorPos.y++;
      break;
    case 'LEFT':
      if (state.spectatorPos.x > 0) state.spectatorPos.x--;
      break;
    case 'RIGHT':
      if (state.spectatorPos.x < 9) state.spectatorPos.x++;
      break;
  }
  updateSpectatorGrid();
}

// --- Payload parsing ---

function parseAnchorPayload(decodedPayload, prefix) {
  const start = `${prefix}:`;
  if (typeof decodedPayload !== 'string' || !decodedPayload.startsWith(start)) return null;
  try {
    const obj = JSON.parse(decodedPayload.slice(start.length));
    if (!obj) return null;

    const isValidAnchor = (a) => {
      if (!a) return false;
      if (typeof a.sid !== 'string') return false;
      if (typeof a.round !== 'number') return false;
      if (typeof a.prev_root !== 'string') return false;
      if (typeof a.root !== 'string') return false;
      if (typeof a.moves !== 'string') return false;
      if (!Array.isArray(a.dts)) return false;
      if (a.dts.length !== a.moves.length) return false;
      return true;
    };

    // Single schema: either a single anchor object, or a bundle: { sid, anchors:[anchor...] }
    if (Array.isArray(obj.anchors)) {
      if (typeof obj.sid !== 'string') return null;
      const anchors = obj.anchors.filter(isValidAnchor);
      if (anchors.length !== obj.anchors.length) return null;
      if (!anchors.every((a) => a.sid === obj.sid)) return null;
      return { sid: obj.sid, anchors };
    }

    if (!isValidAnchor(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

// --- Verification ---

async function verifyAnchorRoot(obj) {
  const prev = obj.prev_root ?? 'GENESIS';
  const moves = obj.moves || '';
  const dts = obj.dts || [];
  const leafHexes = [];

  leafHexes.push(await sha256Hex(`prev:${prev}`));

  // v2 format: includes timing
  for (let i = 0; i < moves.length; i++) {
    leafHexes.push(await sha256Hex(`m:${moves[i]}:dt:${dts[i]}:i:${i}`));
  }

  const computed = await merkleRootSha256Hex(leafHexes);
  return computed === obj.root;
}

// --- Chain ordering ---

function pushPending(obj) {
  const key = obj.prev_root;
  let list = state.spectatorPendingByPrevRoot.get(key);
  if (!list) {
    list = [];
    state.spectatorPendingByPrevRoot.set(key, list);
  }
  // Avoid duplicates
  if (!list.some(x => x.root === obj.root)) {
    list.push(obj);
    list.sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
  }
}

function resetForSession(sessionId, startPos) {
  state.spectatorSessionId = sessionId ?? null;
  state.spectatorExpectedPrevRoot = 'GENESIS';
  state.spectatorExpectedRound = 0;
  state.spectatorLastSeq = -1;
  state.spectatorPendingByPrevRoot = new Map();
  state.spectatorSeenKeys = new Set();
  state.seenMerkleRoots = new Set();
  state.spectatorLastRoot = null;
  state.spectatorLastRound = null;

  state.spectatorPos = {
    x: startPos?.x ?? 4,
    y: startPos?.y ?? 4
  };

  state.spectatorLatency = { last: null, avg: null, max: null, count: 0, sum: 0 };

  setSpectatorBadges();
  createGrid('spectatorGrid', 'grid-cell spectator-mode');
  updateSpectatorGrid();

  log('spectatorLogPanel', `Spectator reset. Session: ${state.spectatorSessionId ? state.spectatorSessionId.slice(0, 8) : '--'}`, true);
}

function cancelReplay() {
  for (const t of replayTimers) clearTimeout(t);
  replayTimers = [];
  replayInProgress = false;
}

// --- Move application with latency tracking ---

async function applyMovesWithLatency(obj, { animate = false, stepMs = 0 } = {}) {
  const moves = obj.moves || '';
  const dts = obj.dts || [];
  const base = Date.now();
  const t0 = obj.t0 ?? base;

  for (let i = 0; i < moves.length; i++) {
    const ch = moves[i];
    const dir = ch === 'U' ? 'UP' : ch === 'D' ? 'DOWN' : ch === 'L' ? 'LEFT' : ch === 'R' ? 'RIGHT' : null;
    if (dir) applyMove(dir);

    // Compute latency for this move (at the time it is applied)
    const now = Date.now();
    const eventTs = t0 + (dts[i] ?? 0);
    const latency = Math.max(0, now - eventTs);

    const L = state.spectatorLatency;
    L.last = latency;
    L.count += 1;
    L.sum += latency;
    L.avg = L.sum / L.count;
    L.max = L.max == null ? latency : Math.max(L.max, latency);

    if (animate) {
      // Ensure the UI paints each move when catching up.
      await nextFrame();
      if (stepMs > 0) await sleep(stepMs);
    }
  }

  setSpectatorBadges();
}

// --- Main anchor processing ---

async function tryAcceptAnchor(obj, meta, opts = {}) {
  if (!obj) return;

  // Never mix replay with live processing
  if (replayInProgress) return;

  // Session filter (strict)
  if (!state.spectatorSessionId) {
    state.spectatorSessionId = state.sessionId || obj.sid;
    setSpectatorBadges();
  }
  if (obj.sid !== state.spectatorSessionId) return;

  // Dedupe MUST include root; bundles can contain multiple anchors under one txid.
  const dedupeKey = meta?.txid ? `tx:${meta.txid}:root:${obj.root}` : `root:${obj.root}`;
  if (state.spectatorSeenKeys.has(dedupeKey)) return;
  state.spectatorSeenKeys.add(dedupeKey);

  // Strict chain ordering: must start at round=0 + prev_root=GENESIS, then continue.
  const expectedPrev = state.spectatorExpectedPrevRoot ?? 'GENESIS';
  const expectedRound = state.spectatorExpectedRound ?? 0;

  // Ignore anchors older than what we've already applied
  if (typeof obj.round === 'number' && obj.round < expectedRound) return;

  if (obj.prev_root !== expectedPrev || obj.round !== expectedRound) {
    pushPending(obj);
    log('spectatorLogPanel', `↺ buffered round=${obj.round} (waiting for round=${expectedRound}, prev=${String(expectedPrev).slice(0, 8)}...)`);
    return;
  }

  // For round 0, the payload's start position is authoritative
  if (obj.round === 0 && typeof obj.startX === 'number' && typeof obj.startY === 'number') {
    state.spectatorPos = { x: obj.startX, y: obj.startY };
    updateSpectatorGrid();
  }

  // Verify cryptographic root
  const ok = await verifyAnchorRoot(obj);
  if (!ok) {
    log('spectatorLogPanel', `✗ verify failed round=${obj.round} root=${obj.root.slice(0, 12)}...`);
    return;
  }

  // Check sequence continuity (informational)
  if (typeof obj.seq0 === 'number' && state.spectatorLastSeq >= 0) {
    if (obj.seq0 !== state.spectatorLastSeq + 1) {
      log('spectatorLogPanel', `⚠ seq gap: expected ${state.spectatorLastSeq + 1} got ${obj.seq0}`);
    }
  }

  // Mark root as seen
  state.seenMerkleRoots.add(obj.root);

  // Apply the moves
  await applyMovesWithLatency(obj, {
    animate: !!opts.animateMoves,
    stepMs: typeof opts.moveStepMs === 'number' ? opts.moveStepMs : 0,
  });

  // Advance chain expectations
  state.spectatorExpectedPrevRoot = obj.root;
  state.spectatorExpectedRound = expectedRound + 1;
  state.spectatorLastRoot = obj.root;
  state.spectatorLastRound = obj.round;

  if (typeof obj.seq0 === 'number') {
    state.spectatorLastSeq = obj.seq0 + obj.moves.length - 1;
  }

  log('spectatorLogPanel', `✓ round=${obj.round} moves=${obj.moves.length} root=${obj.root.slice(0, 12)}...`);
}

// --- Handler for indexer events ---

function handleMatchObject(matchObj, prefix) {
  if (!matchObj) return;
  if (!state.spectatorActive) return;

  const payloadStr = typeof matchObj.decodedPayload === 'string' ? matchObj.decodedPayload : null;
  if (!payloadStr) return;

  const obj = parseAnchorPayload(payloadStr, prefix);
  if (!obj) return;

  if (Array.isArray(obj.anchors)) {
    for (const a of obj.anchors) enqueueLiveAnchor(a, matchObj);
    startLiveProcessing();
    return;
  }

  enqueueLiveAnchor(obj, matchObj);
  startLiveProcessing();
}

// --- Backfill from indexer ---

async function initialBackfillFromIndexer(prefix) {
  const indexer = state.portal.intelligence.indexer;
  if (!indexer) return;

  // Cached (IndexedDB)
  try {
    const cached = await indexer.getAllCachedMatchingTransactions?.();
    const arr = Array.isArray(cached) ? cached : [];
    for (const tx of arr) {
      await handleMatchObject(tx, prefix);
    }
  } catch (e) {
    // ignore
  }

  // In-memory (recent, not yet flushed)
  try {
    const inMem = indexer.getAllMatchingTransactions?.() || [];
    for (const tx of inMem) {
      await handleMatchObject(tx, prefix);
    }
  } catch (e) {
    // ignore
  }
}

async function collectSessionAnchors(prefix, sessionId) {
  const indexer = state.portal.intelligence.indexer;
  if (!indexer) return [];

  const out = [];
  const seenRoots = new Set();

  const pushTx = async (tx) => {
    const payloadStr = typeof tx?.decodedPayload === 'string' ? tx.decodedPayload : null;
    if (!payloadStr) return;
    const obj = parseAnchorPayload(payloadStr, prefix);
    if (!obj) return;

    const pushOne = (a) => {
      if (a.sid !== sessionId) return;
      if (seenRoots.has(a.root)) return;
      seenRoots.add(a.root);
      out.push(a);
    };

    if (Array.isArray(obj.anchors)) {
      for (const a of obj.anchors) pushOne(a);
      return;
    }

    pushOne(obj);
  };

  try {
    const cached = await indexer.getAllCachedMatchingTransactions?.();
    const arr = Array.isArray(cached) ? cached : [];
    for (const tx of arr) {
      await pushTx(tx);
    }
  } catch {}

  try {
    const inMem = indexer.getAllMatchingTransactions?.() || [];
    for (const tx of inMem) {
      await pushTx(tx);
    }
  } catch {}

  return out;
}

async function buildOrderedChain(anchors) {
  const byRound = new Map();
  for (const a of anchors) {
    if (!byRound.has(a.round)) byRound.set(a.round, []);
    byRound.get(a.round).push(a);
  }

  const ordered = [];
  let expectedPrev = 'GENESIS';
  let round = 0;

  while (true) {
    const candidates = byRound.get(round) || [];
    const next = candidates.find(a => a.prev_root === expectedPrev);
    if (!next) break;

    const ok = await verifyAnchorRoot(next);
    if (!ok) break;

    ordered.push(next);
    expectedPrev = next.root;
    round += 1;
  }

  return ordered;
}

function applyMovesAnimated(anchors, stepMs = 75) {
  let delay = 0;
  for (const a of anchors) {
    const moves = a.moves || '';
    for (let i = 0; i < moves.length; i++) {
      const ch = moves[i];
      const dir = ch === 'U' ? 'UP' : ch === 'D' ? 'DOWN' : ch === 'L' ? 'LEFT' : ch === 'R' ? 'RIGHT' : null;
      if (!dir) continue;

      const tid = setTimeout(() => {
        if (!replayInProgress) return;
        applyMove(dir);
      }, delay);
      replayTimers.push(tid);
      delay += stepMs;
    }
  }

  const doneId = setTimeout(() => {
    if (!replayInProgress) return;
    replayInProgress = false;
    setStatus('spectatorStatus', 'Replay Finished', 'connected');
    $('startSpectatorBtn').disabled = false;
    $('replaySpectatorBtn').disabled = false;
    $('stopSpectatorBtn').disabled = true;
    log('spectatorLogPanel', 'Replay finished.', false);
  }, delay + 10);
  replayTimers.push(doneId);
}

export async function replayFromStart() {
  if (!state.connected) {
    alert('Connect to a node first!');
    return;
  }
  if (!state.portal.intelligence.scanner) {
    alert('Scanner not ready yet. Connect first.');
    return;
  }

  stopSpectator();
  cancelReplay();

  const prefix = $('payloadPrefix')?.value || 'anticheat:move';
  const sessionId = state.sessionId || state.spectatorSessionId;
  if (!sessionId) {
    alert('No session to replay yet. Start a game first.');
    return;
  }

  resetSpectatorState();
  resetForSession(sessionId, state.playerStartPos || { x: 4, y: 4 });

  // Replay mode
  replayInProgress = true;
  $('startSpectatorBtn').disabled = true;
  $('replaySpectatorBtn').disabled = true;
  $('stopSpectatorBtn').disabled = false;
  setStatus('spectatorStatus', 'Replaying', 'connected');
  log('spectatorLogPanel', `Replaying session ${sessionId.slice(0, 8)} from start...`, true);

  const all = await collectSessionAnchors(prefix, sessionId);
  const ordered = await buildOrderedChain(all);

  if (!ordered.length || ordered[0].round !== 0 || ordered[0].prev_root !== 'GENESIS') {
    replayInProgress = false;
    $('startSpectatorBtn').disabled = false;
    $('replaySpectatorBtn').disabled = false;
    $('stopSpectatorBtn').disabled = true;
    setStatus('spectatorStatus', 'Replay Failed', 'disconnected');
    log('spectatorLogPanel', 'Replay failed: could not find a valid round=0 anchor for this session.', false);
    return;
  }

  // Authoritative start position from round 0 anchor
  if (typeof ordered[0].startX === 'number' && typeof ordered[0].startY === 'number') {
    state.spectatorPos = { x: ordered[0].startX, y: ordered[0].startY };
    updateSpectatorGrid();
  }

  // Latency stats are not meaningful for replay
  state.spectatorLatency = { last: null, avg: null, max: null, count: 0, sum: 0 };
  setSpectatorBadges();

  applyMovesAnimated(ordered, 75);
}

// --- Public API ---

export function startSpectator() {
  if (!state.connected) {
    alert('Connect to a node first!');
    return;
  }

  if (!state.portal.intelligence.scanner) {
    alert('Scanner not ready yet. Connect first.');
    return;
  }

  stopSpectator();
  cancelReplay();
  resetSpectatorState();

  // Use current player session if available
  const startSession = state.sessionId || null;
  const startPos = state.playerStartPos || { x: 4, y: 4 };

  resetForSession(startSession, startPos);

  state.spectatorActive = true;

  const prefix = $('payloadPrefix')?.value || 'anticheat:move';
  state.portal.intelligence.scanner.prefix = prefix;

  log('spectatorLogPanel', `Watching for anchors... prefix="${prefix}"`, false);

  // Live updates via indexer events
  indexerHandler = async (evt) => {
    if (!state.spectatorActive) return;
    if (!evt || !evt.type) return;

    // Indexer can emit a single match object or a batch array.
    const items = Array.isArray(evt.data) ? evt.data : (evt.data ? [evt.data] : []);

    if (evt.type === INDEXER_EVENT.MATCHING_TRANSACTION_IN_MEMORY) {
      for (const item of items) {
        await handleMatchObject(item, prefix);
      }
      return;
    }
    if (evt.type === INDEXER_EVENT.MATCHING_TRANSACTION_CACHED) {
      for (const item of items) {
        await handleMatchObject(item, prefix);
      }
    }
  };
  addIndexerUpdateHandler(indexerHandler);

  // Backfill from indexer
  (async () => {
    await initialBackfillFromIndexer(prefix);
  })();

  setStatus('spectatorStatus', 'Watching', 'connected');
  $('startSpectatorBtn').disabled = true;
  $('replaySpectatorBtn').disabled = true;
  $('stopSpectatorBtn').disabled = false;
}

export function stopSpectator() {
  state.spectatorActive = false;

  cancelReplay();

  if (indexerHandler) {
    removeIndexerUpdateHandler(indexerHandler);
    indexerHandler = null;
  }

  if (state.spectatorTimer) {
    clearInterval(state.spectatorTimer);
    state.spectatorTimer = null;
  }

  resetLiveQueueUi();

  setStatus('spectatorStatus', 'Stopped', 'disconnected');
  $('startSpectatorBtn').disabled = false;
  if ($('replaySpectatorBtn')) $('replaySpectatorBtn').disabled = false;
  $('stopSpectatorBtn').disabled = true;
}

// For live player sync (when player and spectator are both active on same page)
export function syncWithPlayer(move) {
  if (!state.spectatorActive) return;
  applyMove(move.direction);
  log('spectatorLogPanel', `[LIVE] ${move.direction} → (${move.x}, ${move.y})`);
}

export function initSpectator() {
  createGrid('spectatorGrid', 'grid-cell spectator-mode');
  $('startSpectatorBtn').addEventListener('click', startSpectator);
  $('replaySpectatorBtn').addEventListener('click', replayFromStart);
  $('stopSpectatorBtn').addEventListener('click', stopSpectator);

  // Ensure banner element exists early (so first behind state is instant)
  try {
    ensureBehindBanner();
  } catch {
    // ignore
  }

  // Listen for new session events from player
  window.addEventListener('antiCheat:newSession', (ev) => {
    const { sessionId, startPos } = ev.detail || {};
    if (!sessionId) return;

    cancelReplay();

    // If spectator is active, reset to new session immediately
    if (state.spectatorActive) {
      resetForSession(sessionId, startPos);
      log('spectatorLogPanel', `New game detected! Resetting to session ${sessionId.slice(0, 8)}...`, false);
    } else {
      // Just update badges
      state.spectatorSessionId = sessionId;
      setSpectatorBadges();
    }
  });
}
