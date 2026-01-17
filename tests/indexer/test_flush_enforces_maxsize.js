// test_flush_enforces_maxsize.js
// Enterprise-grade: flush() must enforce maxSize immediately

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' (timeout ' + ms + 'ms)')), ms))
  ]);
}

export async function runTestFlushEnforcesMaxSize(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };

  const dbName = 'kaspaIndexer_test_flush_enforces_maxsize_' + Date.now();
  log('[TEST] Starting flush enforces maxSize test with dbName=' + dbName);

  let evictedSize = 0;
  const indexer = new KaspaIndexer({
    dbName,
    matchMode: MatchMode.TRANSACTIONS,
    maxSize: 10,
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

    const now = Date.now();
    log('[TEST] Adding 100 transactions, then flushing once...');
    for (let i = 0; i < 100; i++) {
      await indexer.addTransaction({ txid: 'tx_' + i, timestamp: now + i }, false);
    }

    await withTimeout(indexer.flush(), 15000, 'flush');

    const count = await withTimeout(indexer._countStore('transactions'), 8000, '_countStore(transactions)');
    log('[TEST] Post-flush transactions count=' + count);
    log('[TEST] Size evictions observed=' + evictedSize);

    if (count > 10) {
      log('[FAIL] flush() did not enforce maxSize immediately (' + count + ' > 10)');
      return logs.join('\n');
    }
    if (evictedSize < 1) {
      log('[FAIL] Expected at least one size eviction event');
      return logs.join('\n');
    }

    log('[TEST] PASS: flush enforces maxSize immediately');
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
