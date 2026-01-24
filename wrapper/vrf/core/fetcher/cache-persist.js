// cache-persist.js
// Persistent file-based cache for BTC blocks and QRNG
import { logInfo, logError } from "../logs/logger.js";

const BTC_KEY = "btc_block_cache";
const QRNG_KEY = "qrng_cache";

export function getBtcBlockCache() {
  try {
    const raw = localStorage.getItem(BTC_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      logInfo("Read BTC block cache", { BTC_KEY });
      return data;
    }
  } catch (err) {
    logError("Failed to read BTC block cache", { BTC_KEY, error: err.message });
  }
  return { blocks: [], timestamp: 0 };
}

export function setBtcBlockCache(blocks) {
  try {
    localStorage.setItem(
      BTC_KEY,
      JSON.stringify({ blocks, timestamp: Date.now() }),
    );
    logInfo("Wrote BTC block cache", { BTC_KEY });
  } catch (err) {
    logError("Failed to write BTC block cache", {
      BTC_KEY,
      error: err.message,
    });
  }
}

export function getQrngCache() {
  try {
    const raw = localStorage.getItem(QRNG_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      logInfo("Read QRNG cache", { QRNG_KEY });
      return data;
    }
  } catch (err) {
    logError("Failed to read QRNG cache", { QRNG_KEY, error: err.message });
  }
  return { provider: null, length: null, result: null, timestamp: 0 };
}

export function setQrngCache(provider, length, result) {
  try {
    localStorage.setItem(
      QRNG_KEY,
      JSON.stringify({ provider, length, result, timestamp: Date.now() }),
    );
    logInfo("Wrote QRNG cache", { QRNG_KEY });
  } catch (err) {
    logError("Failed to write QRNG cache", { QRNG_KEY, error: err.message });
  }
}
