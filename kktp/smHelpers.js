import {
  canonicalize,
  strictParseJson,
} from "./protocol/integrity/canonical.js";
import {
  discoveryValidator,
  responseValidator,
  sessionEndValidator,
} from "./protocol/integrity/validator.js";

export function normalizeEpochMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 1e12 ? n : n * 1000;
}

export function getExpectedEndMs(anchor, createdAtMs) {
  if (!anchor) return null;
  const meta = anchor.meta || anchor.metadata || {};

  const candidates = [
    meta.expected_time_up,
    meta.expectedTimeUp,
    meta.expectedEnd,
    meta.expected_end,
    meta.expiresAt,
    meta.expires_at,
    meta.expiry,
    meta.expiryMs,
    anchor.expected_time_up,
    anchor.expectedTimeUp,
    anchor.expectedEnd,
    anchor.expected_end,
    anchor.expiresAt,
    anchor.expires_at,
    anchor.expiry,
    anchor.expiryMs,
  ].filter((v) => v != null);

  for (const v of candidates) {
    const ms = normalizeEpochMs(v);
    if (ms) return ms;
  }

  const ttlCandidates = [
    meta.ttlSeconds,
    meta.ttl_seconds,
    meta.durationSeconds,
    meta.duration_seconds,
    meta.ttlMs,
    meta.durationMs,
    meta.timeToLive,
  ].filter((v) => v != null);

  const base =
    normalizeEpochMs(anchor.timestamp || anchor.time || meta.timestamp) ||
    normalizeEpochMs(createdAtMs) ||
    null;

  for (const v of ttlCandidates) {
    const ttlMs = normalizeEpochMs(v);
    if (ttlMs && base) return base + ttlMs;
  }

  return null;
}

export function buildAnchorPayload(anchor) {
  return `KKTP:ANCHOR:${canonicalize(anchor)}`;
}

export function parseKKTPPayload(rawPayload) {
  if (!rawPayload || !rawPayload.startsWith("KKTP:")) return null;

  if (rawPayload.startsWith("KKTP:ANCHOR:")) {
    const jsonStr = rawPayload.substring("KKTP:ANCHOR:".length);
    try {
      const anchor = strictParseJson(jsonStr);
      return { type: "anchor", anchor };
    } catch {
      return null;
    }
  }

  const parts = rawPayload.split(":");
  if (parts.length >= 3) {
    const mailboxId = parts[1];
    const jsonStr = parts.slice(2).join(":");
    try {
      const message = strictParseJson(jsonStr);
      return { type: "message", mailboxId, message };
    } catch {
      return null;
    }
  }

  return null;
}

export function validateAnchorOrThrow(anchor) {
  if (!anchor?.type) {
    throw new Error("Invalid anchor: missing type");
  }
  if (anchor.type === "discovery") {
    discoveryValidator.validate(anchor);
    return;
  }
  if (anchor.type === "response") {
    responseValidator.validate(anchor);
    return;
  }
  if (anchor.type === "session_end") {
    sessionEndValidator.validate(anchor);
    return;
  }
  throw new Error(`Unknown anchor type: ${anchor.type}`);
}

export function extractResumeState(session) {
  const k = session?.sm?.kktp || {};
  return {
    mailbox_id: session?.sm?.kktp?.mailboxId || session?.mailboxId || "",
    K_session: k.sessionKey || k.K_session || null,
    last_seq_AtoB: k.seqAtoB ?? k.last_seq_AtoB ?? null,
    last_seq_BtoA: k.seqBtoA ?? k.last_seq_BtoA ?? null,
    keyIndex: session?.keyIndex ?? null,
    remote_pub_sig: session?.peerPubSig || null,
    isInitiator: !!session?.isInitiator,
    createdAt: session?.createdAt || Date.now(),
    discovery: session?.discovery || null,
    response: session?.response || null,
    messages: session?.messages || [],
  };
}

export function applyResumeState(ctx, resume) {
  const k = ctx?.sm?.kktp;
  if (!k) return;

  if (resume.mailbox_id) k.mailboxId = resume.mailbox_id;
  if (resume.K_session) k.sessionKey = resume.K_session;
  if (resume.last_seq_AtoB != null) k.seqAtoB = resume.last_seq_AtoB;
  if (resume.last_seq_BtoA != null) k.seqBtoA = resume.last_seq_BtoA;
}

export function zeroOutSessionKey(session) {
  const k = session?.sm?.kktp;
  if (!k) return;
  if (typeof k.sessionKey === "string") k.sessionKey = "";
  else k.sessionKey = null;
}
