/**
 * Bitcoin block entropy source (fetched from public APIs).
 */

import { KinesisError } from '../errors';

export interface BtcBlockSource {
  /** Array of block hashes */
  hashes: string[];
  /** Hex-encoded concatenated hash bytes */
  entropyHex: string;
  /** Block heights */
  heights: number[];
}

export interface FetchBtcBlocksOptions {
  /** Number of recent blocks to fetch (default 6) */
  count?: number;
  /** API timeout in ms (default 15000) */
  timeoutMs?: number;
}

/**
 * Fetch recent BTC block hashes as an entropy source.
 */
export async function fetchBtcBlocks(options: FetchBtcBlocksOptions = {}): Promise<BtcBlockSource> {
  const { count = 6, timeoutMs = 15_000 } = options;

  const { fetchBtcBlocksAdapter } = await import('../adapters/vrf-adapter');

  try {
    const result = await fetchBtcBlocksAdapter({ count, timeoutMs });
    return result;
  } catch (e) {
    throw KinesisError.vrfFetchFailed('Failed to fetch BTC blocks', e);
  }
}
