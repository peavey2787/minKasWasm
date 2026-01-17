// test_ttl_batch_threshold_ratio.js
// Enterprise-grade: TTL eviction respects batchThresholdRatio

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' (timeout ' + ms + 'ms)')), ms))
  ]);
}

async function seedTransactions(indexer, { expired, fresh, ttlMs, prefix }) {
  const now = Date.now();
  for (let i = 0; i < expired; i++) {
    await indexer.addTransaction({ txid: prefix + '_old_' + i, timestamp: now - ttlMs - 10_000 - i }, false);
  }
  for (let i = 0; i < fresh; i++) {
    await indexer.addTransaction({ txid: prefix + '_new_' + i, timestamp: now + i }, false);
  }
}

export async function runTestTTLBatchThresholdRatio(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };

  const dbName = 'kaspaIndexer_test_ttl_batch_threshold_ratio_' + Date.now();
  log('[TEST] Starting TTL batchThresholdRatio test with dbName=' + dbName);

  let evictedTTL = 0;
  const ttlSeconds = 2;
  const ttlMs = ttlSeconds * 1000;

  const indexer = new KaspaIndexer({
    dbName,
    matchMode: MatchMode.TRANSACTIONS,
    ttlMinutes: ttlSeconds / 60,
    maxSize: null,
    priorityTTL: true,
    batchThresholdRatio: 0.9,
    inMemoryMaxTxs: 999999,
    flushInterval: 999999,
    onIndexerUpdate: (event) => {
      if (event && event.type === 'evict' && event.data && event.data.reason === 'ttl') evictedTTL++;
    }
  });

  try {
    await withTimeout(indexer.initDB(), 8000, 'initDB');

    log('[TEST] Case A: 10 expired / 90 fresh (should NOT evict due to 0.9 threshold)');
    await seedTransactions(indexer, { expired: 10, fresh: 90, ttlMs, prefix: 'A' });
    await withTimeout(indexer.flush(), 15000, 'flush');
    const beforeA = await indexer._countStore('transactions');
    await withTimeout(indexer.evict(), 15000, 'evictA');
    const afterA = await indexer._countStore('transactions');
    log('[TEST] Count before=' + beforeA + ' after=' + afterA + ' evictedTTL=' + evictedTTL);

    if (beforeA !== afterA) {
      log('[FAIL] Expected no TTL eviction when expiredCount < threshold');
      return logs.join('\n');
    }

    log('[TEST] Clearing DB for case B...');
    await indexer.clearStore('transactions');

    evictedTTL = 0;
    log('[TEST] Case B: 95 expired / 5 fresh (should evict due to threshold)');
    await seedTransactions(indexer, { expired: 95, fresh: 5, ttlMs, prefix: 'B' });
    await withTimeout(indexer.flush(), 15000, 'flushB');
    const beforeB = await indexer._countStore('transactions');
    await withTimeout(indexer.evict(), 15000, 'evictB');
    const afterB = await indexer._countStore('transactions');
    log('[TEST] Count before=' + beforeB + ' after=' + afterB + ' evictedTTL=' + evictedTTL);

    if (afterB >= beforeB) {
      log('[FAIL] Expected TTL eviction to reduce store size');
      return logs.join('\n');
    }
    if (evictedTTL < 1) {
      log('[FAIL] Expected at least one TTL eviction event');
      return logs.join('\n');
    }

    log('[TEST] PASS: TTL eviction respects batchThresholdRatio');
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
