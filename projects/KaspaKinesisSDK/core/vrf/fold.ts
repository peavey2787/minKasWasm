/**
 * VRF fold — combine entropy sources into a final verifiable output.
 */

import type { KaspaBlockSource } from './kaspa-source';
import type { BtcBlockSource } from './btc-source';
import type { QrngSource } from './qrng-source';

export interface FoldOptions {
  /** Kaspa block entropy (optional) */
  kaspa?: KaspaBlockSource;
  /** BTC block entropy (optional) */
  btc?: BtcBlockSource;
  /** QRNG entropy (optional) */
  qrng?: QrngSource;
  /** Number of hash iterations (default 1000) */
  iterations?: number;
}

export interface FoldResult {
  /** Final folded output (hex) */
  outputHex: string;
  /** Inputs used (for verification) */
  inputs: {
    kaspaEntropyHex: string | null;
    btcEntropyHex: string | null;
    qrngEntropyHex: string | null;
  };
  /** Number of iterations performed */
  iterations: number;
}

/**
 * Fold multiple entropy sources into a single verifiable output.
 * Uses SHA-256 iterative hashing.
 *
 * @example
 * ```ts
 * const kaspa = await vrf.fetchKaspaBlocks({ client, count: 100 });
 * const btc = await vrf.fetchBtcBlocks({ count: 6 });
 * const qrng = await vrf.fetchQrng({ bytes: 32 });
 * const result = await vrf.fold({ kaspa, btc, qrng, iterations: 10000 });
 * console.log(result.outputHex);
 * ```
 */
export async function fold(options: FoldOptions): Promise<FoldResult> {
  const { kaspa, btc, qrng, iterations = 1000 } = options;

  // Concatenate all entropy
  const parts: string[] = [];
  if (kaspa?.entropyHex) parts.push(kaspa.entropyHex);
  if (btc?.entropyHex) parts.push(btc.entropyHex);
  if (qrng?.entropyHex) parts.push(qrng.entropyHex);

  const combined = parts.join('');

  // Convert hex to bytes
  const bytes = hexToBytes(combined || '00');

  // Iterative SHA-256
  let hash: Uint8Array = bytes;
  for (let i = 0; i < iterations; i++) {
    const digest = await crypto.subtle.digest('SHA-256', hash.buffer as ArrayBuffer);
    hash = new Uint8Array(digest);
  }

  return {
    outputHex: bytesToHex(hash),
    inputs: {
      kaspaEntropyHex: kaspa?.entropyHex ?? null,
      btcEntropyHex: btc?.entropyHex ?? null,
      qrngEntropyHex: qrng?.entropyHex ?? null,
    },
    iterations,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const len = clean.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
