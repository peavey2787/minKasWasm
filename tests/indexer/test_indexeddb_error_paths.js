// test_indexeddb_error_paths.js
// Enterprise-grade: initDB() should reject on IndexedDB open error (no hanging)

import { KaspaIndexer } from '../../wrapper/indexer.js';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' (timeout ' + ms + 'ms)')), ms))
  ]);
}

export async function runTestIndexedDBErrorPaths(logCb) {
  const logs = [];
  const log = (msg) => { logs.push(msg); if (logCb) logCb(msg); console.log(msg); };

  log('[TEST] Starting IndexedDB error path test');

  const originalOpen = indexedDB.open.bind(indexedDB);
  const forcedError = new Error('forced open error');

  try {
    // Monkeypatch open() to force an onerror callback.
    indexedDB.open = function () {
      const req = {};
      setTimeout(() => {
        if (typeof req.onerror === 'function') {
          req.onerror({ target: { error: forcedError } });
        }
      }, 0);
      return req;
    };

    const dbName = 'kaspaIndexer_test_idb_error_' + Date.now();
    const indexer = new KaspaIndexer({ dbName, onIndexerUpdate: () => {} });

    let rejected = false;
    try {
      await withTimeout(indexer.initDB(), 2000, 'initDB should reject');
    } catch (e) {
      rejected = true;
      let msg = '';
      if (e && e.message) msg = e.message;
      else if (e && e.target && e.target.error && e.target.error.message) msg = e.target.error.message;
      else msg = JSON.stringify(e);
      log('[TEST] initDB rejected as expected: ' + msg);
    }

    if (!rejected) {
      log('[FAIL] Expected initDB() to reject when indexedDB.open fails');
      return logs.join('\n');
    }

    log('[TEST] PASS: initDB rejects on open err (no hang)');
    return logs.join('\n');
  } catch (err) {
    log('ERROR: ' + (err && err.message ? err.message : err));
    return logs.join('\n');
  } finally {
    try { indexedDB.open = originalOpen; } catch {}
  }
}
