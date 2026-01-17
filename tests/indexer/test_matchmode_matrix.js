// test_matchmode_matrix.js
// Enterprise-grade: MatchMode/CUSTOM flags behavior matrix

import { KaspaIndexer, MatchMode } from '../../wrapper/indexer.js';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' (timeout ' + ms + 'ms)')), ms))
  ]);
}

async function cleanup(indexer, dbName) {
  try {
    await indexer.clearStore('transactions');
    await indexer.clearStore('blocks');
    await indexer.clearStore('matching_transactions');
  } catch {}
  try { if (indexer.db) indexer.db.close(); } catch {}
  try { if (window.indexedDB) window.indexedDB.deleteDatabase(dbName); } catch {}
}

export async function runTestMatchModeMatrix(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };

  const cases = [
    {
      name: 'ALL',
      opts: { matchMode: MatchMode.ALL },
      expect: { matchingTx: 5, tx: 5, blocks: 3 }
    },
    {
      name: 'MATCHING',
      opts: { matchMode: MatchMode.MATCHING },
      expect: { matchingTx: 5, tx: 0, blocks: 0 }
    },
    {
      name: 'TRANSACTIONS',
      opts: { matchMode: MatchMode.TRANSACTIONS },
      expect: { matchingTx: 0, tx: 5, blocks: 0 }
    },
    {
      name: 'BLOCKS',
      opts: { matchMode: MatchMode.BLOCKS },
      expect: { matchingTx: 0, tx: 0, blocks: 3 }
    },
    {
      name: 'CUSTOM(match-only)',
      opts: { matchMode: MatchMode.CUSTOM, indexAllMatchingTransactions: true, indexAllTransactions: false, indexAllBlocks: false },
      expect: { matchingTx: 5, tx: 0, blocks: 0 }
    },
    {
      name: 'CUSTOM(tx-only)',
      opts: { matchMode: MatchMode.CUSTOM, indexAllMatchingTransactions: false, indexAllTransactions: true, indexAllBlocks: false },
      expect: { matchingTx: 0, tx: 5, blocks: 0 }
    },
    {
      name: 'CUSTOM(all)',
      opts: { matchMode: MatchMode.CUSTOM, indexAllMatchingTransactions: true, indexAllTransactions: true, indexAllBlocks: true },
      expect: { matchingTx: 5, tx: 5, blocks: 3 }
    }
  ];

  log('[TEST] Starting match mode matrix test (' + cases.length + ' cases)');

  for (const c of cases) {
    const dbName = 'kaspaIndexer_test_matchmode_' + c.name.replace(/[^a-z0-9]/gi, '_') + '_' + Date.now();
    log('');
    log('[TEST] Case ' + c.name + ' dbName=' + dbName);

    const indexer = new KaspaIndexer({
      dbName,
      flushInterval: 999999,
      inMemoryMaxTxs: 999999,
      inMemoryMaxBlocks: 999999,
      maxSize: null,
      ttlMinutes: null,
      ...c.opts,
      onIndexerUpdate: () => {}
    });

    try {
      await withTimeout(indexer.initDB(), 8000, 'initDB');

      const now = Date.now();
      // Add 5 matching + 5 non-matching txs
      for (let i = 0; i < 5; i++) {
        await indexer.addTransaction({ txid: 'm' + i, timestamp: now + i }, true);
        await indexer.addTransaction({ txid: 't' + i, timestamp: now + 100 + i }, false);
      }
      // Add 3 blocks
      for (let i = 0; i < 3; i++) {
        await indexer.addBlock({ hash: 'b' + i, header: { timestamp: now + 200 + i, hash: 'b' + i } });
      }

      await withTimeout(indexer.flush(), 15000, 'flush');

      const matchingTxs = await indexer.getAllCachedMatchingTransactions();
      const txs = await indexer.getAllCachedTransactions();
      const blocks = await indexer.getAllCachedBlocks();

      log('[DEBUG] matching_transactions=' + matchingTxs.length + ' transactions=' + txs.length + ' blocks=' + blocks.length);

      if (matchingTxs.length !== c.expect.matchingTx) {
        log('[FAIL] ' + c.name + ': expected matching_transactions=' + c.expect.matchingTx + ' got ' + matchingTxs.length);
        return logs.join('\n');
      }
      if (txs.length !== c.expect.tx) {
        log('[FAIL] ' + c.name + ': expected transactions=' + c.expect.tx + ' got ' + txs.length);
        return logs.join('\n');
      }
      if (blocks.length !== c.expect.blocks) {
        log('[FAIL] ' + c.name + ': expected blocks=' + c.expect.blocks + ' got ' + blocks.length);
        return logs.join('\n');
      }

      // Critical invariant: matching txs are ONLY in matching store.
      if (txs.some(tx => String(tx.txid || '').startsWith('m'))) {
        log('[FAIL] ' + c.name + ': found matching txid in TRANSACTIONS store (must be ONLY in MATCHING_TRANSACTIONS)');
        return logs.join('\n');
      }

      log('[TEST] Case PASS: ' + c.name);
    } catch (err) {
      log('ERROR: ' + (err && err.message ? err.message : err));
      return logs.join('\n');
    } finally {
      await cleanup(indexer, dbName);
    }
  }

  log('');
  log('[TEST] PASS: match mode matrix validated');
  return logs.join('\n');
}
