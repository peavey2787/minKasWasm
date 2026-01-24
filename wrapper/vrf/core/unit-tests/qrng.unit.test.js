// qrng.unit.test.js
// Enterprise-grade unit tests for core/fetcher/qrng.js
import { strict as assert } from "assert";
import { getQRNG } from "../fetcher/qrng.js";
import { setQrngCache } from "../fetcher/cache-persist.js";

(async function runQrngUnitTests() {
  // 1. Returns valid data from cache
  setQrngCache("anu", 16, { data: [1, 2, 3, 4], length: 4, provider: "anu" });
  const result = await getQRNG("anu", 16);
  assert.ok(
    result && Array.isArray(result.data),
    "getQRNG returns object with data array",
  );
  assert.equal(result.data.length, 4, "getQRNG returns correct data length");

  // 2. Throws on invalid length
  let threw = false;
  try {
    await getQRNG("anu", 0);
  } catch (e) {
    threw = true;
  }
  assert.ok(threw, "getQRNG throws on invalid length");

  // 3. Returns cached data if throttled
  setQrngCache("anu", 16, { data: [5, 6, 7, 8], length: 4, provider: "anu" });
  const result2 = await getQRNG("anu", 16);
  assert.ok(
    Array.isArray(result2.data),
    "throttled getQRNG returns data array",
  );

  console.log("All qrng.js unit tests passed.");
})();
