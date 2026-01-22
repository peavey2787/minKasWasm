/**
 * Quantum Random Number Generator (QRNG) entropy source.
 */

import { KinesisError } from '../errors';

export interface QrngSource {
  /** Hex-encoded random bytes */
  entropyHex: string;
  /** Number of bytes */
  byteCount: number;
}

export interface FetchQrngOptions {
  /** Number of bytes to fetch (default 32) */
  bytes?: number;
  /** Manual input (hex, base64, or comma-separated bytes) — used first if provided */
  manualInput?: string;
  /** Timeout in ms (default 10000) */
  timeoutMs?: number;
}

/**
 * Fetch QRNG bytes as an entropy source.
 * If manualInput is provided, it will be parsed and used instead of fetching.
 */
export async function fetchQrng(options: FetchQrngOptions = {}): Promise<QrngSource> {
  const { bytes = 32, manualInput, timeoutMs = 10_000 } = options;

  const { fetchQrngAdapter } = await import('../adapters/vrf-adapter');

  try {
    const result = await fetchQrngAdapter({ bytes, manualInput, timeoutMs });
    return result;
  } catch (e) {
    throw KinesisError.vrfFetchFailed('Failed to fetch QRNG', e);
  }
}
