import { getQrngCache, setQrngCache } from "./cache.js";
import { Block } from "../models/Block.js";
import { NISTBeacon } from "./QRNG-fetcher.js";
import { logInfo, logError } from "../logs/logger.js";
import { CONFIG } from "../config.js";

const nistProvider = new NISTBeacon();

export async function getQRNG(providerName = "nist", length = 32) {
  if (!length || length <= 0) {
    throw new Error("Invalid QRNG length");
  }

  const cache = getQrngCache();
  if (cache?.result?.hash && (Date.now() - cache.timestamp < CONFIG.QRNG_CACHE_DURATION)) {
    return cache.result;
  }

  try {
    const response = await nistProvider.request(nistProvider.baseUrl);
    const pulse = response.pulse;
    const previousValue =
      pulse.listValues?.find((v) => v.type === "previous")?.value ||
      pulse.previousOutputValue;
    const qrngBlock = new Block({
      hash: pulse.outputValue,
      time: pulse.timeStamp,
      source: providerName,
      seedValue: pulse.seedValue,
      certificateId: pulse.certificateId,
      previousOutputValue: pulse.localPrevHash || previousValue,
      pulseIndex: pulse.pulseIndex,
      signature: pulse.signatureValue,
      signatureValue: pulse.signatureValue,
      uri: pulse.uri,
      version: pulse.version,
      cipherSuite: pulse.cipherSuite,
      period: pulse.period,
      chainIndex: pulse.chainIndex,
      timeStamp: pulse.timeStamp,
      localRandomValue: pulse.localRandomValue,
      external: pulse.external,
      listValues: pulse.listValues,
      precommitmentValue: pulse.precommitmentValue,
      statusCode: pulse.statusCode,
    });

    setQrngCache(providerName, length, qrngBlock);
    return qrngBlock;
  } catch (err) {
    logError("QRNG Fetch Failed", err.message);
    throw err;
  }
}
