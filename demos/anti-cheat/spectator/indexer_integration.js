import { state, portal, addFoundSession } from '../state.js';
import { parseAnchorPayload } from './parser.js';
import { enqueueLiveAnchor, startLiveProcessing } from './processor.js';

export function handleMatchObject(matchObj, prefix) {
  if (!matchObj) return;
  if (!state.spectatorActive) return;

  const payloadStr = typeof matchObj.decodedPayload === 'string' ? matchObj.decodedPayload : null;
  if (!payloadStr) return;

  const obj = parseAnchorPayload(payloadStr, prefix);
  if (!obj) return;

  if (state.spectatorSessionId && obj.sid !== state.spectatorSessionId) {
    return;
  }

  if (Array.isArray(obj.anchors)) {
    for (const a of obj.anchors) {
      if (!state.spectatorSessionId || a.sid === state.spectatorSessionId) {
        enqueueLiveAnchor(a, matchObj);
      }
    }
    startLiveProcessing();
    return;
  }

  enqueueLiveAnchor(obj, matchObj);
  startLiveProcessing();
}

export async function initialBackfillFromIndexer(prefix) {
  if (!portal.isReady) return;

  const allTxs = [];

  try {
    const cached = await portal.getAllCachedMatchingTransactions();
    if (Array.isArray(cached)) allTxs.push(...cached);
  } catch (e) { /* ignore */ }

  try {
    const inMem = portal.getAllMatchingTransactions();
    if (Array.isArray(inMem)) allTxs.push(...inMem);
  } catch (e) { /* ignore */ }

  const parsedItems = [];
  for (const tx of allTxs) {
    const payloadStr = typeof tx?.decodedPayload === 'string' ? tx.decodedPayload : null;
    if (!payloadStr) continue;
    const obj = parseAnchorPayload(payloadStr, prefix);
    if (obj) {
      if (state.spectatorSessionId && obj.sid !== state.spectatorSessionId) continue;
      parsedItems.push({ tx, obj });
    }
  }

  parsedItems.sort((a, b) => {
    const seqA = typeof a.obj.seq0 === 'number' ? a.obj.seq0 : -999;
    const seqB = typeof b.obj.seq0 === 'number' ? b.obj.seq0 : -999;
    return seqA - seqB;
  });

  for (const item of parsedItems) {
    await handleMatchObject(item.tx, prefix);
  }
}

export async function collectSessionAnchors(prefix, sessionId) {
  if (!portal.isReady) return [];

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
    const cached = await portal.getAllCachedMatchingTransactions();
    const arr = Array.isArray(cached) ? cached : [];
    for (const tx of arr) await pushTx(tx);
  } catch {}

  try {
    const inMem = portal.getAllMatchingTransactions();
    for (const tx of inMem) await pushTx(tx);
  } catch {}

  return out;
}

export async function findLatestSessionId(prefix) {
  if (!portal.isReady) return null;

  try {
    const cached = await portal.getAllCachedMatchingTransactions();
    const inMem = portal.getAllMatchingTransactions();
    const all = [...(cached || []), ...(inMem || [])].sort((a, b) => b.timestamp - a.timestamp);

    for (const tx of all) {
      const payloadStr = typeof tx?.decodedPayload === 'string' ? tx.decodedPayload : null;
      if (!payloadStr) continue;
      const obj = parseAnchorPayload(payloadStr, prefix);
      if (obj && obj.sid) return obj.sid;
    }
  } catch (e) {
    console.warn("Error finding latest session:", e);
  }
  return null;
}

export function extractSessionFromTx(tx, prefix) {
  const payloadStr = typeof tx?.decodedPayload === 'string' ? tx.decodedPayload : null;
  if (!payloadStr) return null;

  const obj = parseAnchorPayload(payloadStr, prefix);
  if (!obj) return null;

  const check = (a) => {
    if (a.type === 'discovery' && a.sid) {
      return {
        sid: a.sid,
        meta: a.meta || {},
        timestamp: (a.meta && a.meta.timestamp) || tx.timestamp || Date.now()
      };
    }
    return null;
  };

  if (Array.isArray(obj.anchors)) {
    for (const a of obj.anchors) {
      const res = check(a);
      if (res) return res;
    }
  } else {
    return check(obj);
  }
  return null;
}

/**
 * Bootstrap the Game Browser by scanning all cached and in-memory transactions.
 * This bridges the "Live vs. Historical" gap - called when scanning starts.
 * Adds discovered sessions to the persistent foundSessions state.
 * @param {string} prefix - The payload prefix to match
 * @returns {Promise<number>} - Number of new sessions discovered
 */
export async function bootstrapGameBrowserFromCache(prefix) {
  if (!portal.isReady) return 0;

  const TEN_MIN_MS = 10 * 60 * 1000;
  const normalizeTimestamp = (ts) => {
    const n = Number(ts);
    if (!Number.isFinite(n)) return null;
    return n < 1e12 ? n * 1000 : n;
  };

  const isRecentTx = (tx, cutoffMs) => {
    const ts = normalizeTimestamp(tx?.timestamp);
    if (!ts) return true;
    return (Date.now() - ts) <= cutoffMs;
  };

  let newCount = 0;
  const allTxs = [];

  // Gather from both cache and in-memory
  try {
    const cached = await portal.getAllCachedMatchingTransactions();
    if (Array.isArray(cached)) {
      for (const tx of cached) {
        if (isRecentTx(tx, TEN_MIN_MS)) allTxs.push(tx);
      }
    }
  } catch (e) { /* ignore */ }

  try {
    const inMem = portal.getAllMatchingTransactions();
    if (Array.isArray(inMem)) allTxs.push(...inMem);
  } catch (e) { /* ignore */ }

  // Extract sessions from all transactions
  for (const tx of allTxs) {
    const session = extractSessionFromTx(tx, prefix);
    if (session) {
      const isNew = addFoundSession(session);
      if (isNew) newCount++;
    }
  }

  console.log(`[GameBrowser] Bootstrap complete: ${newCount} new sessions from ${allTxs.length} txs`);
  return newCount;
}
