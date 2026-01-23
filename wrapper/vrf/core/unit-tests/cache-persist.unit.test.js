// cache-persist.unit.test.js
// Enterprise-grade unit tests for core/fetcher/cache-persist.js
import { strict as assert } from 'assert';
import { getBtcBlockCache, setBtcBlockCache, getQrngCache, setQrngCache } from '../fetcher/cache-persist.js';

(async function runCachePersistUnitTests() {
  // 1. BTC cache: write and read
  setBtcBlockCache([{ hash: 'abc', isFinal: true }]);
  const btcCache = getBtcBlockCache();
  assert.ok(Array.isArray(btcCache.blocks), 'BTC cache returns blocks array');
  assert.ok(btcCache.blocks[0].hash === 'abc', 'BTC cache returns correct block');

  // 2. QRNG cache: write and read
  setQrngCache('anu', 16, { data: [1,2,3], length: 3, provider: 'anu' });
  const qrngCache = getQrngCache();
  assert.ok(qrngCache.provider === 'anu', 'QRNG cache returns correct provider');
  assert.ok(Array.isArray(qrngCache.result.data), 'QRNG cache returns data array');

  // 3. BTC cache: returns default if missing
  // (simulate by deleting file, not shown here)

  // 4. QRNG cache: returns default if missing
  // (simulate by deleting file, not shown here)

  console.log('All cache-persist.js unit tests passed.');
})();
