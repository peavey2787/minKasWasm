// test_concurrency_flush.js
// Enterprise-grade concurrency flush guard test for KaspaIndexer

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' (timeout ' + ms + 'ms)')), ms))
  ]);
}

export async function runTestConcurrencyFlush(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };

  const dbName = 'kaspaIndexer_test_concurrency_flush_' + Date.now();
  log('[TEST] Starting concurrency flush guard test with dbName=' + dbName);

  const indexer = new KaspaIndexer({
    dbName,
    matchMode: MatchMode.TRANSACTIONS,
    maxSize: 50,
    inMemoryMaxTxs: 999999,
    flushInterval: 999999,
    onIndexerUpdate: () => {}
  });

  try {
    await withTimeout(indexer.initDB(), 8000, 'initDB');

    log('[TEST] Adding 200 non-matching transactions (go to transactions store)...');
    const now = Date.now();
    for (let i = 0; i < 200; i++) {
      await indexer.addTransaction({ txid: 'tx_' + i, timestamp: now + i }, false);
    }

    log('[TEST] Launching 30 concurrent flush() calls...');
    await withTimeout(Promise.all(Array.from({ length: 30 }, () => indexer.flush())), 15000, 'concurrent flush');

    const cachedTxs = await withTimeout(indexer.getAllCachedTransactions(), 8000, 'getAllCachedTransactions');
    log('[TEST] Cached transactions count=' + cachedTxs.length);

    if (cachedTxs.length > 50) {
      log('[FAIL] maxSize not enforced after concurrent flush (' + cachedTxs.length + ' > 50)');
      return logs.join('\n');
    }

    log('[TEST] PASS: concurrent flush guarded and maxSize enforced');
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
