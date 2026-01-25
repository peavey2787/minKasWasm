import { getQrngCache, setQrngCache } from "./cache.js";
import { Block } from "../models/Block.js";
import { NISTBeacon } from "./QRNG-fetcher.js";
import { logInfo, logError } from "../logs/logger.js";

const nistProvider = new NISTBeacon();

export async function getQRNG(providerName = "nist", length = 32) {
  const cache = getQrngCache();
  if (cache?.result?.hash && (Date.now() - cache.timestamp < CONFIG.QRNG_CACHE_DURATION)) {
    return cache.result;
  }

  try {
    const response = await nistProvider.request(nistProvider.baseUrl);
    const pulse = response.pulse;
    const qrngBlock = new Block({
      hash: pulse.outputValue,
      time: pulse.timeStamp,
      source: providerName,
      seedValue: pulse.seedValue,
      certificateId: pulse.certificateId,
      previousOutputValue: pulse.localPrevHash || pulse.previousOutputValue,
      pulseIndex: pulse.pulseIndex,
      signature: pulse.signatureValue
    });

    setQrngCache(providerName, length, qrngBlock);
    return qrngBlock;
  } catch (err) {
    logError("QRNG Fetch Failed", err.message);
    throw err;
  }
}
