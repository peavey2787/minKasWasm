import { state } from '../state.js';
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
  const indexer = state.portal.intelligence.indexer;
  if (!indexer) return;

  const allTxs = [];

  try {
    const cached = await indexer.getAllCachedMatchingTransactions?.();
    if (Array.isArray(cached)) allTxs.push(...cached);
  } catch (e) { /* ignore */ }

  try {
    const inMem = indexer.getAllMatchingTransactions?.();
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
    for (const tx of arr) await pushTx(tx);
  } catch {}

  try {
    const inMem = indexer.getAllMatchingTransactions?.() || [];
    for (const tx of inMem) await pushTx(tx);
  } catch {}

  return out;
}

export async function findLatestSessionId(prefix) {
  const indexer = state.portal.intelligence.indexer;
  if (!indexer) return null;

  try {
    const cached = await indexer.getAllCachedMatchingTransactions?.() || [];
    const inMem = indexer.getAllMatchingTransactions?.() || [];
    const all = [...cached, ...inMem].sort((a, b) => b.timestamp - a.timestamp);

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