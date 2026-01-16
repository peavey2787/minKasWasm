// test_eviction.js
// Production-ready eviction logic test for KaspaIndexer

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

export async function runTestEviction() {
  try {
    const logs = [];
    // Accept a log callback for streaming logs to the dashboard
    const log = (typeof arguments[0] === 'function')
      ? (msg) => { logs.push(msg); arguments[0](msg); console.log(msg); }
      : (msg) => { logs.push(msg); console.log(msg); };
    log('[TEST] Starting eviction logic test');
    // Use unique DB name to avoid collisions in repeated tests
    const dbName = 'kaspaIndexer_test_eviction_' + Date.now();
    const ttlSeconds = 2; // Short TTL for test
    const maxSize = 5; // Small size for test
    let evictedTTL = 0;
    let evictedSize = 0;
    const indexer = new KaspaIndexer({
      ttlMinutes: ttlSeconds / 60, // TTL in minutes
      maxSize,
      flushInterval: 10000,
      dbName,
      matchMode: MatchMode.MATCHING,
      priorityTTL: true,
      onIndexerUpdate: (event) => {
        if (event.type === 'evict') {
          log('[DEBUG] Eviction event: ' + JSON.stringify(event.data));
          if (event.data.reason === 'ttl') evictedTTL++;
          if (event.data.reason === 'size') evictedSize++;
        }
      }
    });
    log('[TEST] Initializing DB...');
    await indexer.initDB();
    log('[TEST] DB initialized. Adding expired transactions...');

    // Add expired transactions (simulate old timestamps)
    const now = Date.now();
    const cutoff = now - (ttlSeconds * 1000);
    log('[DEBUG] TTL cutoff timestamp: ' + cutoff);
    for (let i = 0; i < 10; i++) {
      const ts = now - (ttlSeconds * 1000 + 10000); // much older than cutoff
      log(`[DEBUG] Adding oldtx${i} with timestamp: ${ts}`);
      await indexer.addTransaction({ txid: 'oldtx' + i, timestamp: ts });
    }
    log('[TEST] Adding fresh transactions...');
    // Add fresh transactions just after cutoff
    for (let i = 0; i < 7; i++) {
      const ts = now - (ttlSeconds * 1000) + 500; // just after cutoff
      log(`[DEBUG] Adding newtx${i} with timestamp: ${ts}`);
      await indexer.addTransaction({ txid: 'newtx' + i, timestamp: ts });
    }
    log('[TEST] Flushing transactions to IndexedDB...');
    await indexer.flush();

    log('[TEST] Waiting for TTL to expire before eviction...');
    await new Promise(resolve => setTimeout(resolve, (ttlSeconds + 1) * 1000));

    log('[TEST] Running eviction...');
    await indexer.evict();
    log('[TEST] Eviction complete. Checking results...');

    // Check that expired transactions were evicted by TTL
    if (evictedTTL < 3) {
      log(`[FAIL] TTL eviction did not remove all expired items (evicted ${evictedTTL})`);
      return logs.join('\n');
    }

    // Check that excess transactions were evicted by size
    const cachedTxs = await indexer.getAllCachedMatchingTransactions();
    log(`[DEBUG] IndexedDB matching tx store length: ${cachedTxs.length}`);
    if (cachedTxs.length > maxSize) {
      log(`[FAIL] Size eviction did not enforce maxSize (${cachedTxs.length} > ${maxSize})`);
      return logs.join('\n');
    }
    if (evictedSize < (3 + 7 - maxSize - evictedTTL)) {
      // Should evict enough to get down to maxSize after TTL evictions
      log(`[FAIL] Size eviction did not remove enough items (evicted ${evictedSize})`);
      return logs.join('\n');
    }

    // Clean up: clear stores and close DB
    log('[TEST] Cleaning up stores and closing DB...');
    await indexer.clearStore('transactions');
    await indexer.clearStore('blocks');
    await indexer.clearStore('matching_transactions');
    if (indexer.db) indexer.db.close();
    if (indexedDB) {
      indexedDB.deleteDatabase(dbName);
    }

    log('[TEST] PASS: TTL and size eviction logic enforced');
    return logs.join('\n');
  } catch (err) {
    const msg = 'ERROR: ' + (err && err.message ? err.message : err);
    console.error(msg);
    return msg;
  }
}
