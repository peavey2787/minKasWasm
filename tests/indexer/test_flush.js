// test_flush.js
// Production-ready flush logic test for KaspaIndexer

import { KaspaIndexer } from '../../wrapper/indexer.js';

export async function runTestFlush() {
  try {
    // Use unique DB name to avoid collisions in repeated tests
    const dbName = 'kaspaIndexer_test_flush_' + Date.now();
    let flushedTxs = 0;
    let flushedBlocks = 0;
    const indexer = new KaspaIndexer({
      inMemoryMaxTxs: 10, // Set higher than 5 to prevent auto-flush
      inMemoryMaxBlocks: 10,
      flushInterval: 10000, // Long interval so we control flush manually
      dbName,
      onIndexerUpdate: (event) => {
        if (event.type === 'transaction-cached') flushedTxs++;
        if (event.type === 'block-cached') flushedBlocks++;
      }
    });
    await indexer.initDB();

    // Add transactions and blocks to fill buffer
    for (let i = 0; i < 5; i++) {
      await indexer.addTransaction({ txid: 'tx' + i, timestamp: Date.now() });
      await indexer.addBlock({ hash: 'block' + i, header: { timestamp: Date.now(), hash: 'block' + i } });
    }

    // Buffer should be full, but not flushed yet
    if (indexer._pendingTxs.length !== 5) {
      return 'FAIL: Transaction buffer not filled as expected (' + indexer._pendingTxs.length + ')';
    }
    if (indexer._pendingBlocks.length !== 5) {
      return 'FAIL: Block buffer not filled as expected (' + indexer._pendingBlocks.length + ')';
    }

    // Manually flush
    await indexer.flush();

    // After flush, buffers should be empty
    if (indexer._pendingTxs.length !== 0) {
      return 'FAIL: Transaction buffer not cleared after flush (' + indexer._pendingTxs.length + ')';
    }
    if (indexer._pendingBlocks.length !== 0) {
      return 'FAIL: Block buffer not cleared after flush (' + indexer._pendingBlocks.length + ')';
    }

    // Check that all items were flushed to IndexedDB
    const cachedTxs = await indexer.getAllCachedMatchingTransactions();
    if (cachedTxs.length !== 5) {
      return 'FAIL: Not all transactions flushed to IndexedDB (' + cachedTxs.length + ')';
    }
    const cachedBlocks = await indexer.getAllCachedBlocks();
    if (cachedBlocks.length !== 5) {
      return 'FAIL: Not all blocks flushed to IndexedDB (' + cachedBlocks.length + ')';
    }

    // Check event counts
    if (flushedTxs !== 5) {
      return 'FAIL: transaction-cached events not emitted for all flushed txs (' + flushedTxs + ')';
    }
    if (flushedBlocks !== 5) {
      return 'FAIL: block-cached events not emitted for all flushed blocks (' + flushedBlocks + ')';
    }

    // Clean up: clear stores and close DB
    await indexer.clearStore('transactions');
    await indexer.clearStore('blocks');
    await indexer.clearStore('matching_transactions');
    if (indexer.db) indexer.db.close();
    if (window.indexedDB) {
      window.indexedDB.deleteDatabase(dbName);
    }

    return 'PASS: Flush logic works as expected';
  } catch (err) {
    return 'ERROR: ' + (err && err.message ? err.message : err);
  }
}
