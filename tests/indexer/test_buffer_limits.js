// test_buffer_limits.js
// Production-ready buffer limits test for KaspaIndexer

import { KaspaIndexer } from '../../wrapper/indexer.js';

export async function runTestBufferLimits() {
  try {
    const logs = [];
    const log = (msg) => { logs.push(msg); console.log(msg); };
    const start = performance.now();
    // Use unique DB name to avoid collisions in repeated tests
    const dbName = 'kaspaIndexer_test_buffer_limits_' + Date.now();
    log(`[TEST] Starting buffer limits test with dbName=${dbName}`);
    const indexer = new KaspaIndexer({
      inMemoryMaxTxs: 10,
      inMemoryMaxBlocks: 10,
      maxSize: 10, 
      flushInterval: 10000, // Long interval so we control flush manually
      dbName,
      onIndexerUpdate: () => {}      
    });
    log('[TEST] Initializing DB...');
    let dbInitSuccess = false;
    let dbInitError = null;
    const dbInitStart = performance.now();
    try {
      await Promise.race([
        (async () => {
          log('[DEBUG] Awaiting indexer.initDB()...');
          await indexer.initDB();
          dbInitSuccess = true;
          log('[DEBUG] indexer.initDB() resolved.');
        })(),
        new Promise((_, reject) => setTimeout(() => {
          log('[DEBUG] DB init timeout reached.');
          reject(new Error('DB init timeout'));
        }, 5000))
      ]);
    } catch (e) {
      dbInitError = e;
      log('[ERROR] DB initialization failed: ' + (e && e.message ? e.message : e));
      log('[ERROR] Error object: ' + JSON.stringify(e));
      return logs.join('\n');
    }
    const dbInitEnd = performance.now();
    log(`[DEBUG] DB init step took ${(dbInitEnd-dbInitStart).toFixed(2)}ms`);
    if (!dbInitSuccess) {
      log('[ERROR] DB initialization did not complete.');
      if (dbInitError) log('[ERROR] Error object: ' + JSON.stringify(dbInitError));
      return logs.join('\n');
    }
    log('[TEST] DB initialized.');

    // Test in-memory transaction buffer
    log('[TEST] Adding 20 transactions...');
    for (let i = 0; i < 20; i++) {
      await indexer.addTransaction({ txid: 'tx' + i, timestamp: Date.now() });
      if ((i+1) % 5 === 0) log(`[TEST] Added ${i+1} transactions.`);
    }
    log(`[TEST] In-memory tx buffer length: ${indexer._pendingTxs.length}`);
    if (indexer._pendingTxs.length > 10) {
      log('[FAIL] In-memory transaction buffer overflow!');
      return logs.join('\n');
    }

    // Test in-memory block buffer
    log('[TEST] Adding 20 blocks...');
    for (let i = 0; i < 20; i++) {
      await indexer.addBlock({ hash: 'block' + i, header: { timestamp: Date.now(), hash: 'block' + i } });
      if ((i+1) % 5 === 0) log(`[TEST] Added ${i+1} blocks.`);
    }
    log(`[TEST] In-memory block buffer length: ${indexer._pendingBlocks.length}`);
    if (indexer._pendingBlocks.length > 10) {
      log('[FAIL] In-memory block buffer overflow!');
      return logs.join('\n');
    }

    // Flush and evict to test IndexedDB limits
    log('[TEST] Flushing buffers to IndexedDB...');
    await indexer.flush();
    log('[TEST] Flushed. Evicting...');
    await indexer.evict();
    log('[TEST] Eviction complete.');

    const cachedTxs = await indexer.getAllCachedTransactions();
    log(`[TEST] IndexedDB tx store length: ${cachedTxs.length}`);
    if (cachedTxs.length > 10) {
      log('[FAIL] IndexedDB transaction store overflow!');
      return logs.join('\n');
    }

    const cachedBlocks = await indexer.getAllCachedBlocks();
    log(`[TEST] IndexedDB block store length: ${cachedBlocks.length}`);
    if (cachedBlocks.length > 10) {
      log('[FAIL] IndexedDB block store overflow!');
      return logs.join('\n');
    }

    // Clean up: clear stores and close DB
    log('[TEST] Cleaning up stores and closing DB...');
    await indexer.clearStore('transactions');
    await indexer.clearStore('blocks');
    await indexer.clearStore('matching_transactions');
    if (indexer.db) indexer.db.close();
    // Optionally delete the test DB
    if (window.indexedDB) {
      window.indexedDB.deleteDatabase(dbName);
    }

    const end = performance.now();
    log(`[TEST] PASS: All buffer/store limits enforced. Time: ${(end-start).toFixed(2)}ms`);
    return logs.join('\n');
  } catch (err) {
    const msg = 'ERROR: ' + (err && err.message ? err.message : err);
    console.error(msg);
    return msg;
  }
}
