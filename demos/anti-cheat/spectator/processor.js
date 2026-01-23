import { state } from '../state.js';
import { log } from '../utils.js';
import * as KKTP from '../kktp_lib.js';
import * as UI from './ui.js';
import { replayState } from './spectator_state.js';

const LIVE_PACE_MS_PER_ANCHOR_WHEN_BEHIND = 120;

const live = {
  queue: [], // items: { anchorObj, meta }
  processing: false,
  processPromise: null,
  latestSeqSeen: -1,
  pendingEncrypted: [], // Buffer for packets arriving before keys
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
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
  const lastAppliedSeq = typeof state.spectatorLastSeq === 'number' ? state.spectatorLastSeq : -1;
  const latestSeen = typeof live.latestSeqSeen === 'number' ? live.latestSeqSeen : -1;
  
  const lag = latestSeen >= 0 && lastAppliedSeq >= 0 ? Math.max(0, latestSeen - lastAppliedSeq) : (queued + pending);
  const behind = (queued > 2 || lag > 2);
  
  return { behind, queued, pending, lag };
}

function getAnchorSeq(anchor) {
  if (typeof anchor.seq === 'number') return anchor.seq;
  if (typeof anchor.seq0 === 'number') return anchor.seq0;
  if (anchor.type === 'discovery') return -2;
  if (anchor.type === 'response') return -1;
  if (anchor.type === 'session_end') return Number.MAX_SAFE_INTEGER;
  return -999;
}

export function enqueueLiveAnchor(anchorObj, meta) {
  if (!anchorObj) return;

  const s = getAnchorSeq(anchorObj);
  if (s >= 0) live.latestSeqSeen = Math.max(live.latestSeqSeen, s);

  live.queue.push({ anchorObj, meta });
  live.queue.sort((a, b) => {
    return getAnchorSeq(a.anchorObj) - getAnchorSeq(b.anchorObj);
  });
}

export function resetLiveQueue() {
  live.queue = [];
  live.processing = false;
  live.processPromise = null;
  live.latestSeqSeen = -1;
  live.pendingEncrypted = [];
  try {
    UI.setBehindBanner(false);
  } catch {
    // ignore
  }
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

async function applyMovesWithLatency(obj, { animate = false, stepMs = 0 } = {}) {
  const moves = obj.moves || '';
  const dts = obj.dts || [];
  const base = Date.now();
  const t0 = obj.t0 ?? base;

  for (let i = 0; i < moves.length; i++) {
    const ch = moves[i];
    const dir = ch === 'U' ? 'UP' : ch === 'D' ? 'DOWN' : ch === 'L' ? 'LEFT' : ch === 'R' ? 'RIGHT' : null;
    if (dir) {
      UI.applyMove(dir);
      log('spectatorLogPanel', `[MOVE] #${(obj.seq0 || 0) + i} [${dir}]`, false);
    }

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
      await nextFrame();
      if (stepMs > 0) await sleep(stepMs);
    }
  }

  UI.setSpectatorBadges();
}

async function processAnchor(obj, meta, opts) {
  await applyMovesWithLatency(obj, {
    animate: !!opts.animateMoves,
    stepMs: typeof opts.moveStepMs === 'number' ? opts.moveStepMs : 0,
  });

  const moveCount = obj.moves ? obj.moves.length : 0;
  // Update last sequence to the end of this batch (seq0 + count - 1)
  state.spectatorLastSeq = (obj.seq0 || 0) + moveCount - 1;

  log('spectatorLogPanel', `✓ seq=${obj.seq0} moves=${moveCount}`);
}

async function checkBuffer() {
  while (true) {
    const nextSeq = state.spectatorLastSeq + 1;
    if (state.spectatorBuffer.has(nextSeq)) {
      const item = state.spectatorBuffer.get(nextSeq);
      state.spectatorBuffer.delete(nextSeq);
      log('spectatorLogPanel', `↺ Replaying buffered seq=${nextSeq}`);
      await processAnchor(item.obj, item.meta, item.opts);
    } else {
      break;
    }
  }
}

export async function tryAcceptAnchor(obj, meta, opts = {}) {
  if (!obj) return;

  // Late decryption attempt
  if (obj.type === 'msg' && obj.ciphertext && !obj.moves) {
    if (state.kktp.kSession) {
      if (state.kktp.mailboxId && obj.mailbox_id !== state.kktp.mailboxId) return; 
      try {
        const decrypted = KKTP.decryptMessage(state.kktp.kSession, obj);
        obj = decrypted;
      } catch (e) {
        return;
      }
    } else {
      // No keys yet! Buffer this for later retry once keys are derived.
      // Only buffer if it matches our session (if known) or if we haven't locked a session yet.
      if (!state.spectatorSessionId || obj.sid === state.spectatorSessionId) {
        live.pendingEncrypted.push({ obj, meta, opts });
      }
      return; 
    }
  }

  // Handle KKTP Anchors
  if (obj.type === 'discovery') {
    if (obj.meta && typeof obj.meta.startX === 'number') {
      state.spectatorPos = { x: obj.meta.startX, y: obj.meta.startY };
      UI.updateSpectatorGrid();
    }
    return;
  }
  if (obj.type === 'response') {
    if (obj.vrf_value) {
      const secrets = KKTP.derivePublicSessionSecrets(
        obj.vrf_value, 
        obj.sid, 
        obj.initiator_pub_sig, 
        obj.pub_sig_resp
      );
      state.kktp.kSession = secrets.kSession;
      state.kktp.mailboxId = secrets.mailboxId;
      log('spectatorLogPanel', `Derived session keys from VRF. Mailbox: ${secrets.mailboxId.slice(0,8)}...`);

      // Keys derived: Retry any pending encrypted messages
      if (live.pendingEncrypted.length > 0) {
        const pending = [...live.pendingEncrypted];
        live.pendingEncrypted = [];
        // Sort by packet sequence to process in order
        pending.sort((a, b) => (a.obj.seq || 0) - (b.obj.seq || 0));
        for (const item of pending) {
          await tryAcceptAnchor(item.obj, item.meta, item.opts);
        }
      }
    }
    return;
  }
  if (obj.type === 'session_end') return;

  if (replayState.inProgress) return;

  if (!state.spectatorSessionId) {
    state.spectatorSessionId = state.sessionId || obj.sid;
    UI.setSpectatorBadges();
  }
  if (obj.sid !== state.spectatorSessionId) return;

  const dedupeKey = `sid:${obj.sid}:seq:${obj.seq0}`;
  if (state.spectatorSeenKeys.has(dedupeKey)) return;
  state.spectatorSeenKeys.add(dedupeKey);

  const expectedSeq = state.spectatorLastSeq + 1;
  const incomingSeq = obj.seq0 || 0;

  if (incomingSeq === expectedSeq) {
    await processAnchor(obj, meta, opts);
    await checkBuffer();
  } else if (incomingSeq > expectedSeq) {
    log('spectatorLogPanel', `⏳ Buffering future seq=${incomingSeq} (expecting ${expectedSeq})`);
    state.spectatorBuffer.set(incomingSeq, { obj, meta, opts });
  }
}

export function startLiveProcessing() {
  if (live.processPromise) return live.processPromise;
  live.processPromise = (async () => {
    if (live.processing) return;
    live.processing = true;
    try {
      while (state.spectatorActive && !replayState.inProgress) {
        const item = live.queue.shift();
        if (!item) break;

        const { queued, pending } = computeBehindState();
        const backlog = queued + pending;
        
        const speedMultiplier = backlog >= 5 ? 2.5 : 1.0;
        const anchorInterval = state.anchorInterval || 1250;
        const targetDuration = anchorInterval / speedMultiplier;
        
        const moveCount = item.anchorObj.moves ? item.anchorObj.moves.length : 0;
        const stepMs = moveCount > 0 ? targetDuration / moveCount : 0;

        if (backlog >= 5) UI.setBehindBanner(true, `Spectator behind… backlog=${backlog} (2.5x speed)`);
        else UI.setBehindBanner(false);

        await tryAcceptAnchor(item.anchorObj, item.meta, {
          animateMoves: true,
          moveStepMs: stepMs,
        });

        while (true) {
          const next = takeNextReadyPending();
          if (!next) break;
          await tryAcceptAnchor(next, null, {
            animateMoves: true,
            moveStepMs: stepMs,
          });
          await nextFrame();
        }

        await nextFrame();
      }
    } finally {
      live.processing = false;
      live.processPromise = null;
      UI.setBehindBanner(false);
    }
  })();
  return live.processPromise;
}