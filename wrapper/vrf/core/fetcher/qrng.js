// qrng.js
// QRNG fetching logic with cache
import { getQrngCache, setQrngCache } from "./cache-persist.js";
import { CONFIG } from "../config.js";

import { ANUQRNG, QRandomIO, NISTBeacon } from "./QRNG-fetcher.js";
import { logInfo, logError } from "../logger.js";

const providers = {
  anu: new ANUQRNG(),
  qrandom: new QRandomIO(),
  nist: new NISTBeacon(),
};

function validateProvider(providerName) {
  if (!["anu", "qrandom", "nist"].includes(providerName)) {
    throw new Error(`Invalid QRNG provider: ${providerName}`);
  }
}

/**
/**
 * Fetch QRNG data with caching (1 min)
 * @param {string} providerName - 'anu' or 'qrandom'
 * @param {number} length - Number of bytes/bits
 * @returns {Promise<any>} - Randomness data
 */
export async function getQRNG(providerName = "nist", length = 16) {
  const now = Date.now();
  const cache = getQrngCache();
  // Only allow a new API call if enough time has passed since last cache
  if (
    cache &&
    cache.result &&
    cache.provider === providerName &&
    cache.length === length
  ) {
    if (now - cache.timestamp < CONFIG.QRNG_API_THROTTLE) {
      logInfo("QRNG API throttled, returning cached data", {
        providerName,
        length,
      });
      return cache.result;
    }
  }
  try {
    validateProvider(providerName);
    if (!Number.isInteger(length) || length <= 0)
      throw new Error("QRNG length must be a positive integer");
    // If cache is still valid, return it
    if (
      cache &&
      cache.result &&
      now - cache.timestamp < CONFIG.QRNG_CACHE_DURATION &&
      cache.provider === providerName &&
      cache.length === length
    ) {
      logInfo("QRNG cache hit", { providerName, length });
      return cache.result;
    }
    // Retry logic for transient errors
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const provider = providers[providerName] || providers.nist;
        const rawResult = await provider.fetchRandomness(length);
        const result = sanitizeQrngResult(rawResult);
        if (Array.isArray(result.data) && result.data.length > 0) {
          setQrngCache(providerName, length, result.data);
          logInfo("QRNG fetched and cached", { providerName, length });
          return result.data;
        } else {
          // Clear the cache if the provider returns invalid data (browser: just remove from localStorage)
          localStorage.removeItem("qrng_cache");
          logError("QRNG provider returned invalid data, cache cleared", {
            providerName,
            length,
          });
          throw new Error("QRNG provider returned invalid data");
        }
      } catch (err) {
        lastErr = err;
        logError(`QRNG fetch attempt ${attempt} failed`, {
          providerName,
          length,
          error: err.message,
        });
        if (attempt < 3) await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
    throw lastErr;
  } catch (err) {
    logError("QRNG fetch error", { providerName, length, error: err.message });
    throw err;
  }
}

// Helper: Sanitize QRNG provider response
function sanitizeQrngResult(result) {
  // Accept a plain array as valid data
  if (Array.isArray(result)) {
    return { data: result, length: result.length, provider: "" };
  }
  if (!result || typeof result !== "object")
    return { data: [], length: 0, provider: "" };
  // Only allow expected fields (adjust as needed for your QRNG schema)
  return {
    data: Array.isArray(result.data) ? result.data : [],
    length: Number.isInteger(result.length)
      ? result.length
      : Array.isArray(result.data)
        ? result.data.length
        : 0,
    provider: typeof result.provider === "string" ? result.provider : "",
  };
}
