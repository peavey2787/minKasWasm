// cache.js
// Simple in-memory cache for BTC blocks and QRNG

let btcBlockCache = { blocks: [], timestamp: 0 };
let qrngCache = { data: null, timestamp: 0 };

export function getBtcBlockCache() {
  return btcBlockCache;
}

export function setBtcBlockCache(blocks) {
  btcBlockCache = { blocks, timestamp: Date.now() };
}

// cache-persist.js - Update these to be cleaner
export function getQrngCache() {
  try {
    const raw = localStorage.getItem(QRNG_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      logInfo("Read QRNG cache", { QRNG_KEY });
      return data; // returns { result, timestamp, provider, length }
    }
  } catch (err) {
    logError("Failed to read QRNG cache", err.message);
  }
  return null;
}

export function setQrngCache(provider, length, result) {
  try {
    // result here should be the NEW Block object
    localStorage.setItem(
      QRNG_KEY,
      JSON.stringify({ provider, length, result, timestamp: Date.now() }),
    );
    logInfo("Wrote QRNG cache", { QRNG_KEY });
  } catch (err) {
    logError("Failed to write QRNG cache", err.message);
  }
}
