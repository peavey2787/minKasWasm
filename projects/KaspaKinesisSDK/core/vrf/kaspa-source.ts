/**
 * Kaspa block entropy source.
 */

import type { KinesisClient } from '../client';
import { KinesisError } from '../errors';

export interface KaspaBlockSource {
  /** Array of block hashes */
  hashes: string[];
  /** Hex-encoded concatenated hash bytes */
  entropyHex: string;
}

export interface FetchKaspaBlocksOptions {
  /** Connected client (needed to stream blocks) */
  client: KinesisClient;
  /** Number of blocks to collect */
  count: number;
  /** Timeout in ms (default 60000) */
  timeoutMs?: number;
}

/**
 * Collect Kaspa block hashes as an entropy source.
 */
export async function fetchKaspaBlocks(options: FetchKaspaBlocksOptions): Promise<KaspaBlockSource> {
  const { client, count, timeoutMs = 60_000 } = options;

  if (!client.connected) throw KinesisError.notConnected();

  // This will be wired to the actual scanner in the adapter
  const { collectKaspaBlocksAdapter } = await import('../adapters/vrf-adapter');

  const result = await collectKaspaBlocksAdapter({
    rpc: client.rpc,
    count,
    timeoutMs,
  });

  return result;
}
