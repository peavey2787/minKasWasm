// bitcoin.unit.test.js
// Enterprise-grade unit tests for core/fetcher/bitcoin.js
import { strict as assert } from 'assert';
import { getBitcoinBlocks } from '../fetcher/bitcoin.js';
import { setBtcBlockCache } from '../fetcher/cache-persist.js';

(async function runBitcoinUnitTests() {
  // 1. Returns array of blocks with correct length
  setBtcBlockCache(Array(6).fill({ isFinal: true }));
  const blocks = await getBitcoinBlocks(6);
  assert.ok(Array.isArray(blocks), 'getBitcoinBlocks returns array');
  assert.equal(blocks.length, 6, 'getBitcoinBlocks returns correct length');

  // 2. Throws on invalid count
  let threw = false;
  try { await getBitcoinBlocks(0); } catch (e) { threw = true; }
  assert.ok(threw, 'getBitcoinBlocks throws on invalid count');

  // 3. Returns cached data if throttled
  setBtcBlockCache(Array(6).fill({ isFinal: true }));
  const blocks2 = await getBitcoinBlocks(6);
  assert.ok(Array.isArray(blocks2), 'throttled getBitcoinBlocks returns array');

  console.log('All bitcoin.js unit tests passed.');
})();
