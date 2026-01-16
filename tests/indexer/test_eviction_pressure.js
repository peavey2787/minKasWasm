// test_eviction_pressure.js
// Enterprise-grade eviction under pressure test for KaspaIndexer

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

export async function runTestEvictionPressure(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };
  try {
    const dbName = 'kaspaIndexer_test_eviction_pressure_' + Date.now();
    const ttlSeconds = 2;
    const maxSize = 20;
    let evictedTTL = 0;
    let evictedSize = 0;
    let evictedInMem = 0;
    const indexer = new KaspaIndexer({
      ttlMinutes: ttlSeconds / 60,
      maxSize,
      inMemoryMaxTxs: 30,
      flushInterval: 10000,
      dbName,
      matchMode: MatchMode.MATCHING,
      priorityTTL: true,
      onIndexerUpdate: (event) => {
        if (event.type === 'evict') {
          log('[DEBUG] Eviction event: ' + JSON.stringify(event.data));
          if (event.data.reason === 'ttl') evictedTTL++;
          if (event.data.reason === 'size') evictedSize++;
          if (event.data.reason === 'in_memory_transaction') evictedInMem++;
        }
      }
    });
    log('[TEST] Initializing DB...');
    await indexer.initDB();
    log('[TEST] DB initialized. Adding transactions and blocks...');

    const now = Date.now();
    // Add 40 expired transactions (should be evicted by TTL)
    for (let i = 0; i < 40; i++) {
      const ts = now - (ttlSeconds * 1000 + 10000); // much older than cutoff
      await indexer.addTransaction({ txid: 'oldtx' + i, timestamp: ts });
    }
    // Add 30 fresh transactions (should be evicted by size)
    for (let i = 0; i < 30; i++) {
      const ts = now - (ttlSeconds * 1000) + 500; // just after cutoff
      await indexer.addTransaction({ txid: 'newtx' + i, timestamp: ts });
    }
    log('[TEST] Flushing transactions to IndexedDB...');
    await indexer.flush();

    log('[TEST] Waiting for TTL to expire before eviction...');
    await new Promise(resolve => setTimeout(resolve, (ttlSeconds + 1) * 1000));

    log('[TEST] Running eviction...');
    await indexer.evict();
    log('[TEST] Eviction complete. Checking results...');

    // Check that a significant number of old transactions were evicted by TTL
    if (evictedTTL < 20) {
      log(`[FAIL] TTL eviction did not remove enough expired items (evicted ${evictedTTL})`);
      return logs.join('\n');
    }
    // Check that size eviction also occurred
    if (evictedSize < 10) {
      log(`[FAIL] Size eviction did not remove enough items (evicted ${evictedSize})`);
      return logs.join('\n');
    }
    // Check that in-memory eviction occurred if buffer overflowed
    if (evictedInMem < 1) {
      log(`[WARN] In-memory eviction did not trigger (evicted ${evictedInMem})`);
    }
    // Check that only maxSize remain in IndexedDB
    const cachedTxs = await indexer.getAllCachedMatchingTransactions();
    log(`[DEBUG] IndexedDB matching tx store length: ${cachedTxs.length}`);
    if (cachedTxs.length > maxSize) {
      log(`[FAIL] IndexedDB store overflow after eviction (${cachedTxs.length} > ${maxSize})`);
      return logs.join('\n');
    }
    // Clean up
    log('[TEST] Cleaning up stores and closing DB...');
    await indexer.clearStore('transactions');
    await indexer.clearStore('blocks');
    await indexer.clearStore('matching_transactions');
    if (indexer.db) indexer.db.close();
    if (indexedDB) {
      indexedDB.deleteDatabase(dbName);
    }
    log('[TEST] PASS: Eviction under pressure works as expected');
    return logs.join('\n');
  } catch (err) {
    const msg = 'ERROR: ' + (err && err.message ? err.message : err);
    console.error(msg);
    return msg;
  }
}
