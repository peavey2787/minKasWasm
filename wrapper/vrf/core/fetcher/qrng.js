import { getQrngCache, setQrngCache } from "./cache-persist.js";
import { Block } from "../models/Block.js";
import { NISTBeacon } from "./QRNG-fetcher.js";
import { logInfo, logError } from "../logs/logger.js";

// THIS MUST BE OUTSIDE THE FUNCTION
const nistProvider = new NISTBeacon();

export async function getQRNG(providerName = "nist", length = 32) {
  const cache = getQrngCache();
  if (cache?.result?.hash && (Date.now() - cache.timestamp < 60000)) {
    return cache.result;
  }

  try {
    // Ensure this uses the correct instance
    const response = await nistProvider.request(nistProvider.baseUrl);
    const pulse = response.pulse;

    const qrngBlock = new Block({
      hash: pulse.outputValue,
      height: pulse.pulseIndex,
      time: pulse.timeStamp,
      source: "nist",
      signature: pulse.signatureValue
    });

    setQrngCache(providerName, length, qrngBlock);
    return qrngBlock;
  } catch (err) {
    logError("QRNG Fetch Failed", err.message);
    throw err;
  }
}
