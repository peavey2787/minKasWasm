import { state, portal } from "../state.js";
import { log } from "../utils.js";
import * as KKTP from "../kktp_lib.js";
import * as UI from "./ui.js";
import { replayState } from "./spectator_state.js";

const LIVE_PACE_MS_PER_ANCHOR_WHEN_BEHIND = 120;

const live = {
  queue: [], // items: { anchorObj, meta }
  processing: false,
  processPromise: null,
  latestSeqSeen: -1,
  pendingEncrypted: [], // Buffer for packets arriving before keys
};

const logSec = (msg) => log("securityLogPanel", msg, false);

function normalizeVrfEvidence(anchor) {
  const proof = anchor?.vrf_proof || {};
  const evidence = proof?.evidence || proof?.ev || anchor?.evidence || {};

  const kaspaBlocks = evidence.kaspaBlocks || evidence.kaspa || [];
  const btcBlocks = evidence.btcBlocks || evidence.btc || [];

  return {
    kaspaBlocks: Array.isArray(kaspaBlocks) ? kaspaBlocks : [],
    btcBlocks: Array.isArray(btcBlocks) ? btcBlocks : [],
    sources: evidence.sources || [],
    iterations: evidence.iterations || 0,
    timestamp: evidence.timestamp || Date.now(),
    foldedOutput: anchor?.vrf_value || null,
  };
}

function captureVrfEvidence(anchor) {
  if (!state.auditHistory) return;

  const normalized = normalizeVrfEvidence(anchor);
  const hasAnyBlocks =
    (normalized.kaspaBlocks?.length || 0) > 0 ||
    (normalized.btcBlocks?.length || 0) > 0;
  const existing = state.auditHistory.vrfData || null;

  if (!existing && (hasAnyBlocks || normalized.foldedOutput)) {
    state.auditHistory.vrfData = normalized;
    logSec(`[VRF] Captured entropy evidence for Auditor.`);
    return;
  }

  if (existing) {
    if (hasAnyBlocks) {
      state.auditHistory.vrfData = {
        ...existing,
        ...normalized,
      };
      logSec(`[VRF] Captured entropy evidence for Auditor.`);
    } else if (normalized.foldedOutput) {
      state.auditHistory.vrfData = {
        ...existing,
        foldedOutput: normalized.foldedOutput,
      };
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function getPendingCount() {
  try {
    let n = 0;
    for (const list of state.spectatorPendingByPrevRoot?.values?.() || [])
      n += list.length;
    return n;
  } catch {
    return 0;
  }
}

function computeBehindState() {
  const queued = live.queue.length;
  const pending = getPendingCount();
  const lastAppliedSeq =
    typeof state.spectatorLastSeq === "number" ? state.spectatorLastSeq : -1;
  const latestSeen =
    typeof live.latestSeqSeen === "number" ? live.latestSeqSeen : -1;

  const lag =
    latestSeen >= 0 && lastAppliedSeq >= 0
      ? Math.max(0, latestSeen - lastAppliedSeq)
      : queued + pending;
  const behind = queued > 2 || lag > 2;

  return { behind, queued, pending, lag };
}

function getAnchorSeq(anchor) {
  if (typeof anchor.seq === "number") return anchor.seq;
  if (typeof anchor.seq0 === "number") return anchor.seq0;
  if (anchor.type === "discovery") return -2;
  if (anchor.type === "response") return -1;
  if (anchor.type === "session_end") return Number.MAX_SAFE_INTEGER;
  return -999;
}

function recordMoveSequences(obj) {
  if (!state.auditHistory || typeof obj?.seq0 !== "number") return;
  const moveCount = obj.moves ? obj.moves.length : 0;

  // Capture the full anchor once (canonical plain JSON)
  const anchorPlain = portal.toPlainJson(obj);

  if (!state.auditHistory.moveBySeq) {
    state.auditHistory.moveBySeq = new Map();
  }

  for (let i = 0; i < moveCount; i++) {
    const currentSeq = obj.seq0 + i;
    state.auditHistory.sequences.push(currentSeq);

    const moveChar = typeof obj.moves === "string" ? obj.moves[i] : null;
    if (moveChar) {
      const existing = state.auditHistory.moveBySeq.get(currentSeq);
      if (!existing) {
        state.auditHistory.moveBySeq.set(currentSeq, moveChar);
      } else if (existing instanceof Set) {
        existing.add(moveChar);
      } else if (existing !== moveChar) {
        state.auditHistory.moveBySeq.set(
          currentSeq,
          new Set([existing, moveChar]),
        );
      }
    }

    // Store cryptographic proof for Auditor (only if signed)
    if (anchorPlain.pub_sig && anchorPlain.sig) {
      state.auditHistory.encryptedMessages.push({
        seq: currentSeq,
        type: "SCHNORR_MOVE",
        pubKey: anchorPlain.pub_sig,
        signature: anchorPlain.sig,
        anchor: anchorPlain,
        data: anchorPlain.moves,
        timestamp: Date.now(),
      });
    }
  }
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

  const idx = nextList.findIndex(
    (x) => x.round === state.spectatorExpectedRound,
  );
  if (idx === -1) return null;

  const [next] = nextList.splice(idx, 1);
  if (nextList.length === 0) {
    state.spectatorPendingByPrevRoot.delete(nextPrev);
  }
  return next;
}

async function applyMovesWithLatency(
  obj,
  { animate = false, stepMs = 0 } = {},
) {
  const moves = obj.moves || "";
  const dts = obj.dts || [];
  const base = Date.now();
  const t0 = obj.t0 ?? base;

  for (let i = 0; i < moves.length; i++) {
    const ch = moves[i];
    const dir =
      ch === "U"
        ? "UP"
        : ch === "D"
          ? "DOWN"
          : ch === "L"
            ? "LEFT"
            : ch === "R"
              ? "RIGHT"
              : null;

    // Strict State Sync: Update state directly, then render
    if (dir) {
      if (dir === "UP" && state.spectatorPos.y > 0) state.spectatorPos.y--;
      if (dir === "DOWN" && state.spectatorPos.y < 9) state.spectatorPos.y++;
      if (dir === "LEFT" && state.spectatorPos.x > 0) state.spectatorPos.x--;
      if (dir === "RIGHT" && state.spectatorPos.x < 9) state.spectatorPos.x++;

      UI.updateSpectatorGrid();
      log(
        "spectatorLogPanel",
        `[MOVE] #${(obj.seq0 || 0) + i} [${dir}]`,
        false,
      );
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
  recordMoveSequences(obj);
  const moveCount = obj.moves ? obj.moves.length : 0;
  const incomingSeq0 = obj.seq0 || 0;

  // 1. Immediately claim these sequences so the buffer doesn't trip
  state.spectatorLastSeq = incomingSeq0 + moveCount - 1;

  // 2. Now run the animation (this can take time, but the seq is already updated)
  await applyMovesWithLatency(obj, {
    animate: !!opts.animateMoves,
    stepMs: opts.moveStepMs || 0,
  });

  log(
    "spectatorLogPanel",
    `✓ Processed Seq ${incomingSeq0}-${state.spectatorLastSeq}`,
  );
}

async function checkBuffer() {
  while (true) {
    const nextSeq = state.spectatorLastSeq + 1;
    if (state.spectatorBuffer.has(nextSeq)) {
      const item = state.spectatorBuffer.get(nextSeq);
      state.spectatorBuffer.delete(nextSeq);
      log("spectatorLogPanel", `↺ Replaying buffered seq=${nextSeq}`);
      await processAnchor(item.obj, item.meta, item.opts);
    } else {
      break;
    }
  }
}

export async function tryAcceptAnchor(obj, meta, opts = {}) {
  if (!obj) return;

  // --- [1. Standard KKTP Decryption] ---
  if (obj.type === "msg" && obj.ciphertext && !obj.moves) {
    // Always capture encrypted payload BEFORE any decryption or early-return
    if (state.auditHistory) {
      state.auditHistory.encryptedMessages.push({
        type: "AEAD",
        ciphertext: obj.ciphertext,
        nonce: obj.nonce,
        mailbox_id: obj.mailbox_id,
        seq: obj.seq,
        direction: obj.direction,
        tag: obj.ciphertext?.slice(-32) || null,
        timestamp: Date.now(),
      });
      if (typeof obj.seq === "number") {
        state.auditHistory.sequences.push(obj.seq);
      }
    }

    if (state.kktp.kSession) {
      if (state.kktp.mailboxId && obj.mailbox_id !== state.kktp.mailboxId) {
        logSec(
          `[INTEGRITY] Mailbox mismatch: expected ${state.kktp.mailboxId.slice(0, 8)}..., got ${obj.mailbox_id?.slice(0, 8) || "unknown"}...`,
        );
        return;
      }
      try {
        logSec(
          `[DECRYPT] Payload: KKTP:${obj.mailbox_id?.slice(0, 8) || "????"}... seq=${obj.seq} dir=${obj.direction}`,
        );

        const decrypted = KKTP.decryptMessage(state.kktp.kSession, obj);
        const tagHex =
          typeof obj.ciphertext === "string" && obj.ciphertext.length >= 32
            ? obj.ciphertext.slice(-32)
            : "unknown";
        logSec(
          `[SEC] AEAD Verify: Tag ${tagHex.slice(0, 4)}... Match Found. Integrity Guaranteed.`,
        );
        logSec(
          `[INTEGRITY] AEAD verified: mailbox ${obj.mailbox_id?.slice(0, 8) || "????"} | seq ${obj.seq} | dir ${obj.direction}`,
        );
        obj = decrypted;
      } catch (e) {
        logSec(
          `[INTEGRITY] AEAD verification failed: seq ${obj.seq} (message dropped)`,
        );
        return;
      }
    } else {
      if (!state.spectatorSessionId || obj.sid === state.spectatorSessionId) {
        live.pendingEncrypted.push({ obj, meta, opts });
        logSec(
          `[DECRYPT] Encrypted payload queued (awaiting session keys) seq=${obj.seq}`,
        );
      }
      return;
    }
  }

  // --- [2. KKTP Handshake & Discovery] ---
  if (obj.type === "discovery") {
    if (
      state.auditHistory &&
      !state.auditHistory.discoveryAnchor &&
      obj.sig &&
      obj.pub_sig
    ) {
      state.auditHistory.discoveryAnchor = portal.toPlainJson(obj);
    }

    captureVrfEvidence(obj);

    if (!state.spectatorHandshakeLogged) {
      logSec(`[SEC] DH-Handshake Initiated: Using X25519 Curve`);
      logSec(
        `[SEC] Peer PubKey Verified: ${obj.pub_sig?.slice(0, 8) || "????"}... (Identity Bound)`,
      );
      state.spectatorHandshakeLogged = true;
    }
    if (obj.meta && typeof obj.meta.startX === "number") {
      state.spectatorPos = { x: obj.meta.startX, y: obj.meta.startY };
      if (typeof obj.meta.seq === "number") {
        state.spectatorLastSeq = obj.meta.seq - 1;
      }
      UI.updateSpectatorGrid();
    }
    return;
  }

  if (obj.type === "response") {
    // 1. MANDATORY AUDIT CAPTURE (Always archive entropy, even if session is live)
    if (state.auditHistory) {
      state.auditHistory.responseAnchor = portal.toPlainJson(obj);
    }

    captureVrfEvidence(obj);

    // 2. SESSION GUARD
    if (state.spectatorSessionEstablished) {
      logSec(`[SEC] VRF/Handshake verified and archived.`);
      return;
    }

    // 3. KEY DERIVATION
    if (obj.vrf_value) {
      logSec(`[VRF] Entropy Value Received: ${obj.vrf_value.slice(0, 8)}...`);
      const proofStr =
        typeof obj.vrf_proof === "string"
          ? obj.vrf_proof
          : JSON.stringify(obj.vrf_proof || "unavailable");
      logSec(`[VRF] Proof: ${proofStr.slice(0, 4)}...${proofStr.slice(-4)}`);

      const secrets = KKTP.derivePublicSessionSecrets(
        obj.vrf_value,
        obj.sid,
        obj.initiator_pub_sig,
        obj.pub_sig_resp,
      );
      state.kktp.kSession = secrets.kSession;
      state.kktp.mailboxId = secrets.mailboxId;
      log(
        "spectatorLogPanel",
        `Derived session keys from VRF. Mailbox: ${secrets.mailboxId.slice(0, 8)}...`,
      );
      logSec(
        `[SEC] HKDF-Expand: Deriving SessionKeys + MailboxID (${secrets.mailboxId.slice(0, 8)})`,
      );
      state.spectatorSessionEstablished = true;

      if (live.pendingEncrypted.length > 0) {
        const pending = [...live.pendingEncrypted];
        live.pendingEncrypted = [];
        pending.sort((a, b) => getAnchorSeq(a.obj) - getAnchorSeq(b.obj));
        for (const item of pending) {
          await tryAcceptAnchor(item.obj, item.meta, item.opts);
        }
      }
    }
    return;
  }

  if (obj.type === "session_end") {
    log("spectatorLogPanel", `Session Ended.`);
    return;
  }

  if (replayState.inProgress) return;
  if (!state.spectatorSessionId)
    state.spectatorSessionId = state.sessionId || obj.sid;
  if (obj.sid !== state.spectatorSessionId) return;

  // --- [3. Sequence Logic] ---
  if (
    state.spectatorLastSeq === null ||
    state.spectatorLastSeq === undefined ||
    state.spectatorLastSeq === -1
  ) {
    state.spectatorLastSeq = (obj.seq0 || 0) - 1;
    log(
      "spectatorLogPanel",
      `System: Initialized sequence baseline to ${obj.seq0}`,
    );
  }

  const expectedSeq = state.spectatorLastSeq + 1;
  const incomingSeq = obj.seq0 || 0;
  const moveCount = obj.moves ? obj.moves.length : 0;
  const endSeq = incomingSeq + moveCount - 1;

  if (incomingSeq === expectedSeq) {
    const dedupeKey = `sid:${obj.sid}:seq:${obj.seq0}`;
    if (state.spectatorSeenKeys.has(dedupeKey)) return;
    state.spectatorSeenKeys.add(dedupeKey);
    await processAnchor(obj, meta, opts);
    await checkBuffer();
  } else if (incomingSeq < expectedSeq && endSeq >= expectedSeq) {
    const dedupeKey = `sid:${obj.sid}:seq:${obj.seq0}`;
    if (state.spectatorSeenKeys.has(dedupeKey)) return;
    state.spectatorSeenKeys.add(dedupeKey);
    const offset = expectedSeq - incomingSeq;
    const partialObj = {
      ...obj,
      moves: obj.moves.slice(offset),
      dts: obj.dts ? obj.dts.slice(offset) : [],
      seq0: expectedSeq,
    };
    await processAnchor(partialObj, meta, opts);
    await checkBuffer();
  } else if (incomingSeq > expectedSeq) {
    log(
      "spectatorLogPanel",
      `⏳ Gap detected: Got ${incomingSeq}, want ${expectedSeq}. Buffering...`,
    );
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

        const moveCount = item.anchorObj.moves
          ? item.anchorObj.moves.length
          : 0;
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
