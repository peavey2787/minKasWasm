// test_concurrency_evict.js
// Enterprise-grade concurrency evict guard test for KaspaIndexer

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' (timeout ' + ms + 'ms)')), ms))
  ]);
}

export async function runTestConcurrencyEvict(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };

  const dbName = 'kaspaIndexer_test_concurrency_evict_' + Date.now();
  log('[TEST] Starting concurrency evict guard test with dbName=' + dbName);

  let evictedSize = 0;
  const indexer = new KaspaIndexer({
    dbName,
    matchMode: MatchMode.TRANSACTIONS,
    maxSize: 30,
    ttlMinutes: null,
    priorityTTL: true,
    inMemoryMaxTxs: 999999,
    flushInterval: 999999,
    onIndexerUpdate: (event) => {
      if (event && event.type === 'evict' && event.data && event.data.reason === 'size') {
        evictedSize++;
      }
    }
  });

  try {
    await withTimeout(indexer.initDB(), 8000, 'initDB');

    log('[TEST] Seeding > maxSize items...');
    const now = Date.now();
    for (let i = 0; i < 150; i++) {
      await indexer.addTransaction({ txid: 'tx_' + i, timestamp: now + i }, false);
    }
    await withTimeout(indexer.flush(), 15000, 'flush');

    log('[TEST] Launching 20 concurrent evict() calls...');
    await withTimeout(Promise.all(Array.from({ length: 20 }, () => indexer.evict())), 15000, 'concurrent evict');

    const cachedTxs = await withTimeout(indexer.getAllCachedTransactions(), 8000, 'getAllCachedTransactions');
    log('[TEST] Cached transactions count=' + cachedTxs.length);
    log('[TEST] Evicted by size events=' + evictedSize);

    if (cachedTxs.length > 30) {
      log('[FAIL] Store still above maxSize after eviction (' + cachedTxs.length + ' > 30)');
      return logs.join('\n');
    }

    if (evictedSize < 1) {
      log('[FAIL] Expected at least one size eviction event');
      return logs.join('\n');
    }

    log('[TEST] PASS: concurrent evict guarded and maxSize enforced');
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
