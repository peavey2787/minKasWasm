// test_priority_size_skips_ttl_cycle.js
// Enterprise-grade: when priorityTTL=false, eviction cycle should skip unless over maxSize

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' (timeout ' + ms + 'ms)')), ms))
  ]);
}

export async function runTestPrioritySizeSkipsTTLCycle(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };

  const dbName = 'kaspaIndexer_test_priority_size_skips_ttl_' + Date.now();
  log('[TEST] Starting priority SIZE skip TTL test with dbName=' + dbName);

  let evictedTTL = 0;
  let evictedSize = 0;
  const indexer = new KaspaIndexer({
    dbName,
    matchMode: MatchMode.TRANSACTIONS,
    maxSize: 100,
    ttlMinutes: 0.0001, // very short TTL, but should be skipped while under maxSize
    priorityTTL: false,
    inMemoryMaxTxs: 999999,
    flushInterval: 999999,
    onIndexerUpdate: (event) => {
      if (event && event.type === 'evict' && event.data) {
        if (event.data.reason === 'ttl') evictedTTL++;
        if (event.data.reason === 'size') evictedSize++;
      }
    }
  });

  try {
    await withTimeout(indexer.initDB(), 8000, 'initDB');

    const now = Date.now();
    log('[TEST] Seeding 10 expired txs (under maxSize) and flushing...');
    for (let i = 0; i < 10; i++) {
      await indexer.addTransaction({ txid: 'old_' + i, timestamp: now - 60_000 - i }, false);
    }
    await withTimeout(indexer.flush(), 15000, 'flush');

    const before = await indexer._countStore('transactions');
    log('[TEST] Count before evict=' + before);

    log('[TEST] Calling evict() (should skip entirely)...');
    await withTimeout(indexer.evict(), 15000, 'evict');

    const after = await indexer._countStore('transactions');
    log('[TEST] Count after evict=' + after);
    log('[TEST] evictedTTL=' + evictedTTL + ' evictedSize=' + evictedSize);

    if (before !== after) {
      log('[FAIL] Eviction changed store while under maxSize (before=' + before + ', after=' + after + ')');
      return logs.join('\n');
    }
    if (evictedTTL !== 0 || evictedSize !== 0) {
      log('[FAIL] Expected no eviction events while under maxSize');
      return logs.join('\n');
    }

    log('[TEST] Now forcing over maxSize and evicting...');
    for (let i = 0; i < 250; i++) {
      await indexer.addTransaction({ txid: 'new_' + i, timestamp: now + i }, false);
    }
    await withTimeout(indexer.flush(), 15000, 'flush2');
    await withTimeout(indexer.evict(), 15000, 'evict2');

    const finalCount = await indexer._countStore('transactions');
    log('[TEST] Final count=' + finalCount);

    if (finalCount > 100) {
      log('[FAIL] Still above maxSize after eviction (' + finalCount + ' > 100)');
      return logs.join('\n');
    }
    if (evictedSize < 1) {
      log('[FAIL] Expected size eviction when over maxSize');
      return logs.join('\n');
    }

    log('[TEST] PASS: size-priority skip logic works');
    return logs.join('\n');
  } catch (err) {
    const msg = 'ERROR: ' + (err && err.message ? err.message : err);
    log(msg);
    return logs.join('\n');
  } finally {
    try {
      await indexer.clearStore('transactions');
      await indexer.clearStore('blocks');
      await indexer.clearStore('matching_transactions');
    } catch {}
    try { if (indexer.db) indexer.db.close(); } catch {}
    try { if (window.indexedDB) window.indexedDB.deleteDatabase(dbName); } catch {}
  }
}
