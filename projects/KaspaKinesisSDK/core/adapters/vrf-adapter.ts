/**
 * VRF adapter — bridges SDK to vrf/core/* and external APIs.
 */

import type { KaspaBlockSource } from '../vrf/kaspa-source';
import type { BtcBlockSource } from '../vrf/btc-source';
import type { QrngSource } from '../vrf/qrng-source';

// ─── Kaspa Blocks ─────────────────────────────────────────────────────────────

export interface CollectKaspaBlocksAdapterOptions {
  rpc: unknown;
  count: number;
  timeoutMs: number;
}

export async function collectKaspaBlocksAdapter(
  options: CollectKaspaBlocksAdapterOptions
): Promise<KaspaBlockSource> {
  const { rpc, count, timeoutMs } = options;

  // @ts-expect-error — JS module without types
  const { KaspaBlockScanner } = await import('../../../../wrapper/scanner.js');

  const hashes: string[] = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      scanner?.stop?.();
      if (hashes.length > 0) {
        resolve({ hashes, entropyHex: hashes.join('') });
      } else {
        reject(new Error('Timeout collecting Kaspa blocks'));
      }
    }, timeoutMs);

    const scanner = new KaspaBlockScanner(rpc, {
      indexerOptions: {
        indexAllBlocks: true,
        indexAllTransactions: false,
      },
    });

    scanner.start((block: { hash?: string }) => {
      if (block?.hash) {
        hashes.push(block.hash);
        if (hashes.length >= count) {
          clearTimeout(timeout);
          scanner.stop();
          resolve({ hashes, entropyHex: hashes.join('') });
        }
      }
    });
  });
}

// ─── BTC Blocks ───────────────────────────────────────────────────────────────

export interface FetchBtcBlocksAdapterOptions {
  count: number;
  timeoutMs: number;
}

export async function fetchBtcBlocksAdapter(
  options: FetchBtcBlocksAdapterOptions
): Promise<BtcBlockSource> {
  const { count, timeoutMs } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Fetch latest block height
    const tipRes = await fetch('https://blockchain.info/latestblock', {
      signal: controller.signal,
    });
    const tip = await tipRes.json();
    const tipHeight = tip.height as number;

    const hashes: string[] = [];
    const heights: number[] = [];

    // Fetch recent blocks
    for (let i = 0; i < count; i++) {
      const height = tipHeight - i;
      const res = await fetch(`https://blockchain.info/block-height/${height}?format=json`, {
        signal: controller.signal,
      });
      const data = await res.json();
      const block = data.blocks?.[0];
      if (block?.hash) {
        hashes.push(block.hash);
        heights.push(height);
      }
    }

    clearTimeout(timeout);

    return {
      hashes,
      entropyHex: hashes.join(''),
      heights,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── QRNG ─────────────────────────────────────────────────────────────────────

export interface FetchQrngAdapterOptions {
  bytes: number;
  manualInput?: string;
  timeoutMs: number;
}

export async function fetchQrngAdapter(
  options: FetchQrngAdapterOptions
): Promise<QrngSource> {
  const { bytes, manualInput, timeoutMs } = options;

  // If manual input provided, parse it
  if (manualInput && manualInput.trim()) {
    const hex = parseManualInput(manualInput);
    return { entropyHex: hex, byteCount: hex.length / 2 };
  }

  // Fetch from ANU QRNG API
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `https://qrng.anu.edu.au/API/jsonI.php?length=${bytes}&type=uint8`,
      { signal: controller.signal }
    );
    const data = await res.json();
    const arr: number[] = data.data ?? [];
    const hex = arr.map((b) => b.toString(16).padStart(2, '0')).join('');
    return { entropyHex: hex, byteCount: arr.length };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseManualInput(input: string): string {
  const trimmed = input.trim();

  // Try hex
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Try base64
  try {
    const decoded = atob(trimmed);
    return Array.from(decoded)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Not base64
  }

  // Try JSON array
  try {
    const arr = JSON.parse(trimmed);
    if (Array.isArray(arr)) {
      return arr.map((b) => Number(b).toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Not JSON
  }

  // Try comma-separated
  const parts = trimmed.split(/[,\s]+/).filter((p) => /^\d+$/.test(p));
  if (parts.length > 0) {
    return parts.map((p) => Number(p).toString(16).padStart(2, '0')).join('');
  }

  return '';
}
