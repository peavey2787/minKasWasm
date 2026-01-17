// test_fresh_start_sequence.js
// Enterprise-grade: freshStart() must init -> reset -> start and clear DB contents

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' (timeout ' + ms + 'ms)')), ms))
  ]);
}

async function seedDb(dbName) {
  const indexer = new KaspaIndexer({
    dbName,
    matchMode: MatchMode.ALL,
    flushInterval: 999999,
    inMemoryMaxTxs: 999999,
    inMemoryMaxBlocks: 999999,
    onIndexerUpdate: () => {}
  });
  await indexer.initDB();
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    await indexer.addTransaction({ txid: 'm' + i, timestamp: now + i }, true);
    await indexer.addTransaction({ txid: 't' + i, timestamp: now + 100 + i }, false);
    await indexer.addBlock({ hash: 'b' + i, header: { timestamp: now + 200 + i, hash: 'b' + i } });
  }
  await indexer.flush();
  if (indexer.db) indexer.db.close();
}

export async function runTestFreshStartSequence(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };

  const dbName = 'kaspaIndexer_test_fresh_start_' + Date.now();
  log('[TEST] Starting freshStart test with dbName=' + dbName);

  try {
    log('[TEST] Seeding DB with data...');
    await withTimeout(seedDb(dbName), 15000, 'seedDb');

    const indexer = new KaspaIndexer({
      dbName,
      matchMode: MatchMode.ALL,
      flushInterval: 999999,
      inMemoryMaxTxs: 999999,
      inMemoryMaxBlocks: 999999,
      onIndexerUpdate: () => {}
    });

    log('[TEST] Calling freshStart()...');
    await withTimeout(indexer.freshStart(), 20000, 'freshStart');

    const tx = (await indexer.getAllCachedTransactions()).length;
    const match = (await indexer.getAllCachedMatchingTransactions()).length;
    const blocks = (await indexer.getAllCachedBlocks()).length;
    log('[TEST] After freshStart counts: tx=' + tx + ' matching=' + match + ' blocks=' + blocks);

    if (tx !== 0 || match !== 0 || blocks !== 0) {
      log('[FAIL] freshStart did not clear DB properly');
      return logs.join('\n');
    }

    indexer.stop();
    log('[TEST] PASS: freshStart clears DB and starts');
    return logs.join('\n');
  } catch (err) {
    log('ERROR: ' + (err && err.message ? err.message : err));
    return logs.join('\n');
  } finally {
    try {
      const indexer = new KaspaIndexer({ dbName, matchMode: MatchMode.ALL, onIndexerUpdate: () => {} });
      await indexer.initDB();
      await indexer.clearStore('transactions');
      await indexer.clearStore('blocks');
      await indexer.clearStore('matching_transactions');
      if (indexer.db) indexer.db.close();
    } catch {}
    try { if (window.indexedDB) window.indexedDB.deleteDatabase(dbName); } catch {}
  }
}
