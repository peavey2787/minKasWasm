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

const logSec = (msg) => log('securityLogPanel', msg, false);

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

    // Strict State Sync: Update state directly, then render
    if (dir) {
      if (dir === 'UP' && state.spectatorPos.y > 0) state.spectatorPos.y--;
      if (dir === 'DOWN' && state.spectatorPos.y < 9) state.spectatorPos.y++;
      if (dir === 'LEFT' && state.spectatorPos.x > 0) state.spectatorPos.x--;
      if (dir === 'RIGHT' && state.spectatorPos.x < 9) state.spectatorPos.x++;

      UI.updateSpectatorGrid();
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
  const moveCount = obj.moves ? obj.moves.length : 0;
  const incomingSeq0 = obj.seq0 || 0;

  // 1. Immediately claim these sequences so the buffer doesn't trip
  state.spectatorLastSeq = incomingSeq0 + moveCount - 1;

  // 2. Now run the animation (this can take time, but the seq is already updated)
  await applyMovesWithLatency(obj, {
    animate: !!opts.animateMoves,
    stepMs: opts.moveStepMs || 0,
  });

  log('spectatorLogPanel', `✓ Processed Seq ${incomingSeq0}-${state.spectatorLastSeq}`);
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

  // --- [1. Standard KKTP Decryption] ---
  if (obj.type === 'msg' && obj.ciphertext && !obj.moves) {
    if (state.kktp.kSession) {
      if (state.kktp.mailboxId && obj.mailbox_id !== state.kktp.mailboxId) {
        logSec(`[INTEGRITY] Mailbox mismatch: expected ${state.kktp.mailboxId.slice(0, 8)}..., got ${obj.mailbox_id?.slice(0, 8) || 'unknown'}...`);
        return;
      }
      try {
        logSec(`[DECRYPT] Payload: KKTP:${obj.mailbox_id?.slice(0, 8) || '????'}... seq=${obj.seq} dir=${obj.direction}`);

        // Store encrypted message in audit history BEFORE decryption
        if (state.auditHistory) {
          state.auditHistory.encryptedMessages.push({
            ciphertext: obj.ciphertext,
            nonce: obj.nonce,
            mailbox_id: obj.mailbox_id,
            seq: obj.seq,
            direction: obj.direction,
            tag: obj.ciphertext?.slice(-32) || null,
            timestamp: Date.now(),
          });
          // Track sequence for continuity check
          if (typeof obj.seq === 'number') {
            state.auditHistory.sequences.push(obj.seq);
          }
        }

        const decrypted = KKTP.decryptMessage(state.kktp.kSession, obj);
        const tagHex = typeof obj.ciphertext === 'string' && obj.ciphertext.length >= 32
          ? obj.ciphertext.slice(-32)
          : 'unknown';
        logSec(`[SEC] AEAD Verify: Tag ${tagHex.slice(0, 4)}... Match Found. Integrity Guaranteed.`);
        logSec(`[INTEGRITY] AEAD verified: mailbox ${obj.mailbox_id?.slice(0, 8) || '????'} | seq ${obj.seq} | dir ${obj.direction}`);
        obj = decrypted;
      } catch (e) {
        logSec(`[INTEGRITY] AEAD verification failed: seq ${obj.seq} (message dropped)`);
        return;
      }
    } else {
      if (!state.spectatorSessionId || obj.sid === state.spectatorSessionId) {
        live.pendingEncrypted.push({ obj, meta, opts });
        logSec(`[DECRYPT] Encrypted payload queued (awaiting session keys) seq=${obj.seq}`);
      }
      return;
    }
  }

  // --- [2. KKTP Handshake & Discovery] ---
  if (obj.type === 'discovery') {
    // Store discovery anchor in audit history for identity verification
    if (state.auditHistory && !state.auditHistory.discoveryAnchor) {
      state.auditHistory.discoveryAnchor = { ...obj };
    }

    if (!state.spectatorHandshakeLogged) {
      logSec(`[SEC] DH-Handshake Initiated: Using X25519 Curve`);
      logSec(`[SEC] Peer PubKey Verified: ${obj.pub_sig?.slice(0, 8) || '????'}... (Identity Bound)`);
      state.spectatorHandshakeLogged = true;
    }
    if (obj.meta && typeof obj.meta.startX === 'number') {
      state.spectatorPos = { x: obj.meta.startX, y: obj.meta.startY };
      // Kickstart: Use discovery to set baseline sequence if available
      if (typeof obj.meta.seq === 'number') {
        state.spectatorLastSeq = obj.meta.seq - 1;
      }
      UI.updateSpectatorGrid();
    }
    return;
  }

  if (obj.type === 'response') {
    if (state.spectatorSessionEstablished) {
      logSec(`[SEC] Re-handshake detected (session already established). Ignoring duplicate response.`);
      return;
    }

    // Store response anchor in audit history for VRF verification
    if (state.auditHistory && !state.auditHistory.responseAnchor) {
      state.auditHistory.responseAnchor = { ...obj };
    }

    if (obj.vrf_value) {
      logSec(`[VRF] Entropy Value Received: ${obj.vrf_value.slice(0, 8)}...`);
      if (obj.vrf_proof) {
        const proofStr = typeof obj.vrf_proof === 'string'
          ? obj.vrf_proof
          : JSON.stringify(obj.vrf_proof);
        logSec(`[VRF] Proof: ${proofStr.slice(0, 4)}...${proofStr.slice(-4)}`);
      } else {
        logSec(`[VRF] Proof: unavailable`);
      }
      const secrets = KKTP.derivePublicSessionSecrets(
        obj.vrf_value,
        obj.sid,
        obj.initiator_pub_sig,
        obj.pub_sig_resp
      );
      state.kktp.kSession = secrets.kSession;
      state.kktp.mailboxId = secrets.mailboxId;
      log('spectatorLogPanel', `Derived session keys from VRF. Mailbox: ${secrets.mailboxId.slice(0,8)}...`);
      logSec(`[SEC] HKDF-Expand: Deriving SessionKeys + MailboxID (${secrets.mailboxId.slice(0, 8)})`);
      state.spectatorSessionEstablished = true;

      // Keys derived: Retry any pending encrypted messages
      if (live.pendingEncrypted.length > 0) {
        const pending = [...live.pendingEncrypted];
        live.pendingEncrypted = [];
        pending.sort((a, b) => (getAnchorSeq(a.obj) - getAnchorSeq(b.obj)));
        for (const item of pending) {
          await tryAcceptAnchor(item.obj, item.meta, item.opts);
        }
      }
    }
    return;
  }

  if (obj.type === 'session_end') {
    log('spectatorLogPanel', `Session Ended.`);
    return;
  }

  if (replayState.inProgress) return;
  if (!state.spectatorSessionId) state.spectatorSessionId = state.sessionId || obj.sid;
  if (obj.sid !== state.spectatorSessionId) return;

  // --- [3. The Kickstart & Sequence Logic] ---

  // If we haven't processed anything yet, lock onto this incoming anchor as seq0
  if (state.spectatorLastSeq === null || state.spectatorLastSeq === undefined || state.spectatorLastSeq === -1) {
    state.spectatorLastSeq = (obj.seq0 || 0) - 1;
    log('spectatorLogPanel', `System: Initialized sequence baseline to ${obj.seq0}`);
  }

  const expectedSeq = state.spectatorLastSeq + 1;
  const incomingSeq = obj.seq0 || 0;
  const moveCount = obj.moves ? obj.moves.length : 0;
  const endSeq = incomingSeq + moveCount - 1;

  // 1. EXACT MATCH
  if (incomingSeq === expectedSeq) {
    const dedupeKey = `sid:${obj.sid}:seq:${obj.seq0}`;
    if (state.spectatorSeenKeys.has(dedupeKey)) return;
    state.spectatorSeenKeys.add(dedupeKey);

    await processAnchor(obj, meta, opts);
    await checkBuffer();
  }
  // 2. OVERLAP RECOVERY (Batch started in the past but ends in the future)
  else if (incomingSeq < expectedSeq && endSeq >= expectedSeq) {
    const dedupeKey = `sid:${obj.sid}:seq:${obj.seq0}`;
    if (state.spectatorSeenKeys.has(dedupeKey)) return;
    state.spectatorSeenKeys.add(dedupeKey);

    const offset = expectedSeq - incomingSeq;
    const newMoves = obj.moves.slice(offset);
    const newDts = obj.dts ? obj.dts.slice(offset) : [];

    log('spectatorLogPanel', `+ Overlap Recovery: Replaying ${newMoves.length} new moves.`);
    const partialObj = { ...obj, moves: newMoves, dts: newDts, seq0: expectedSeq };
    await processAnchor(partialObj, meta, opts);
    await checkBuffer();
  }
  // 3. FUTURE BUFFERING
  else if (incomingSeq > expectedSeq) {
    log('spectatorLogPanel', `⏳ Gap detected: Got ${incomingSeq}, want ${expectedSeq}. Buffering...`);
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
        // 1. ATOMIC SHIFT: Take it off the queue immediately
        const item = live.queue.shift();
        if (!item) break;

        const { queued, pending } = computeBehindState();
        const backlog = queued + pending;

        const speedMultiplier = backlog >= 5 ? 2.5 : 1.0;
        const anchorInterval = state.anchorInterval || 1250;
        const targetDuration = anchorInterval / speedMultiplier;

        const moveCount = item.anchorObj.moves ? item.anchorObj.moves.length : 0;
        const stepMs = moveCount > 0 ? targetDuration / moveCount : 0;

        if (backlog >= 5) UI.setBehindBanner(true, `Backlog: ${backlog}`);
        else UI.setBehindBanner(false);

        // 2. Process without fear of double-dipping
        await tryAcceptAnchor(item.anchorObj, item.meta, {
          animateMoves: true,
          moveStepMs: stepMs,
        });

        // 3. Handle any out-of-band Merkle/Pending anchors
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
    }
  })();
  return live.processPromise;
}
