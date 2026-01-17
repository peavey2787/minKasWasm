// test_dedup_cache_behavior.js
// Enterprise-grade: dedup cache prevents duplicates within window, allows after eviction

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' (timeout ' + ms + 'ms)')), ms))
  ]);
}

export async function runTestDedupCacheBehavior(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };

  const dbName = 'kaspaIndexer_test_dedup_cache_' + Date.now();
  log('[TEST] Starting dedup cache behavior test with dbName=' + dbName);

  const indexer = new KaspaIndexer({
    dbName,
    matchMode: MatchMode.TRANSACTIONS,
    flushInterval: 999999,
    inMemoryMaxTxs: 999999,
    onIndexerUpdate: () => {}
  });

  try {
    await withTimeout(indexer.initDB(), 8000, 'initDB');

    // Shrink cache so we can test eviction behavior quickly.
    indexer._txidCacheMax = 5;

    const now = Date.now();
    log('[TEST] Adding 5 unique txids...');
    for (let i = 0; i < 5; i++) {
      await indexer.addTransaction({ txid: 'tx' + i, timestamp: now + i }, false);
    }

    const hitsBefore = indexer.getMetrics().cacheHits;
    const pendingBeforeDup = indexer._pendingTxs.length;

    log('[TEST] Adding duplicate tx0 (should be ignored as cache hit)...');
    await indexer.addTransaction({ txid: 'tx0', timestamp: now + 999 }, false);

    const hitsAfter = indexer.getMetrics().cacheHits;
    const pendingAfterDup = indexer._pendingTxs.length;

    if (hitsAfter !== hitsBefore + 1) {
      log('[FAIL] Expected cacheHits to increment on duplicate');
      return logs.join('\n');
    }

    if (pendingAfterDup !== pendingBeforeDup) {
      log('[FAIL] Expected duplicate to not increase pending buffer');
      return logs.join('\n');
    }

    log('[TEST] Pushing cache beyond max to evict tx0 from cache window...');
    for (let i = 5; i < 11; i++) {
      await indexer.addTransaction({ txid: 'tx' + i, timestamp: now + i }, false);
    }

    const pendingBeforeReadd = indexer._pendingTxs.length;
    const hitsBeforeReadd = indexer.getMetrics().cacheHits;

    log('[TEST] Re-adding tx0 (should be accepted after cache eviction)...');
    await indexer.addTransaction({ txid: 'tx0', timestamp: now + 2000 }, false);

    const pendingAfterReadd = indexer._pendingTxs.length;
    const hitsAfterReadd = indexer.getMetrics().cacheHits;

    if (hitsAfterReadd !== hitsBeforeReadd) {
      log('[FAIL] Did not expect cacheHits to increment when tx0 fell out of cache window');
      return logs.join('\n');
    }

    if (pendingAfterReadd !== pendingBeforeReadd + 1) {
      log('[FAIL] Expected pending buffer to increase when tx0 is accepted again');
      return logs.join('\n');
    }

    await withTimeout(indexer.flush(), 15000, 'flush');

    log('[TEST] PASS: dedup cache behaves as expected');
    return logs.join('\n');
  } catch (err) {
    log('ERROR: ' + (err && err.message ? err.message : err));
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
