// test_reset_everything.js
// Enterprise-grade: resetEverything clears DB + in-memory + metrics

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' (timeout ' + ms + 'ms)')), ms))
  ]);
}

export async function runTestResetEverything(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };

  const dbName = 'kaspaIndexer_test_reset_everything_' + Date.now();
  log('[TEST] Starting resetEverything test with dbName=' + dbName);

  const indexer = new KaspaIndexer({
    dbName,
    matchMode: MatchMode.ALL,
    flushInterval: 999999,
    inMemoryMaxTxs: 999999,
    inMemoryMaxBlocks: 999999,
    onIndexerUpdate: () => {}
  });

  try {
    await withTimeout(indexer.initDB(), 8000, 'initDB');

    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await indexer.addTransaction({ txid: 'm' + i, timestamp: now + i }, true);
      await indexer.addTransaction({ txid: 't' + i, timestamp: now + 100 + i }, false);
      await indexer.addBlock({ hash: 'b' + i, header: { timestamp: now + 200 + i, hash: 'b' + i } });
    }

    await withTimeout(indexer.flush(), 15000, 'flush');

    const beforeTx = (await indexer.getAllCachedTransactions()).length;
    const beforeMatch = (await indexer.getAllCachedMatchingTransactions()).length;
    const beforeBlocks = (await indexer.getAllCachedBlocks()).length;
    log('[TEST] Before reset: tx=' + beforeTx + ' matching=' + beforeMatch + ' blocks=' + beforeBlocks);

    if ((beforeTx + beforeMatch + beforeBlocks) === 0) {
      log('[FAIL] Expected non-empty stores before reset');
      return logs.join('\n');
    }

    await withTimeout(indexer.resetEverything(), 15000, 'resetEverything');

    const afterTx = (await indexer.getAllCachedTransactions()).length;
    const afterMatch = (await indexer.getAllCachedMatchingTransactions()).length;
    const afterBlocks = (await indexer.getAllCachedBlocks()).length;

    log('[TEST] After reset: tx=' + afterTx + ' matching=' + afterMatch + ' blocks=' + afterBlocks);

    if (afterTx !== 0 || afterMatch !== 0 || afterBlocks !== 0) {
      log('[FAIL] Stores not empty after reset');
      return logs.join('\n');
    }

    if (indexer._pendingTxs.length !== 0 || indexer._pendingBlocks.length !== 0) {
      log('[FAIL] In-memory pending buffers not cleared after reset');
      return logs.join('\n');
    }

    const metrics = indexer.getMetrics();
    if (metrics.transactionsIndexed !== 0 || metrics.blocksIndexed !== 0) {
      log('[FAIL] Metrics not reset properly: ' + JSON.stringify(metrics));
      return logs.join('\n');
    }

    if (indexer._txidCacheSet.size !== 0) {
      log('[FAIL] Dedup cache not cleared after reset (size=' + indexer._txidCacheSet.size + ')');
      return logs.join('\n');
    }

    log('[TEST] PASS: resetEverything clears DB + memory + metrics');
    return logs.join('\n');
  } catch (err) {
    log('ERROR: ' + (err && err.message ? err.message : err));
    return logs.join('\n');
  } finally {
    try { if (indexer.db) indexer.db.close(); } catch {}
    try { if (window.indexedDB) window.indexedDB.deleteDatabase(dbName); } catch {}
  }
}
