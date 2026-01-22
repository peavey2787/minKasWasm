/**
 * Scanner adapter — bridges SDK to wrapper/scanner.js
 */

import type { Logger } from '../types';

export interface CreateScannerAdapterOptions {
  rpc: unknown;
  prefixes: string[];
  onMatch: (match: {
    txId: string;
    blockHash: string | null;
    timestamp: number | null;
    payloadRaw: string;
    matchedPrefix: string;
  }) => void;
  logger: Logger;
}

/**
 * Create and start a scanner that watches for payload prefixes.
 */
export async function createScannerAdapter(
  options: CreateScannerAdapterOptions
): Promise<unknown> {
  const { rpc, prefixes, onMatch, logger } = options;

  // @ts-expect-error — JS module without types
  const { KaspaBlockScanner } = await import('../../../../wrapper/scanner.js');
  // @ts-expect-error — JS module without types
  const { MatchMode } = await import('../../../../wrapper/indexer.js');

  // Use the first prefix for the scanner's primary prefix
  const primaryPrefix = prefixes[0] || '';

  const scanner = new KaspaBlockScanner(rpc, {
    prefix: primaryPrefix,
    indexerOptions: {
      matchMode: MatchMode.CUSTOM,
      indexAllTransactions: false,
      indexAllMatchingTransactions: true,
      indexAllBlocks: false,
      inMemoryMaxTxs: 500,
      inMemoryMaxBlocks: 200,
      ttlMinutes: 30,
      onIndexerUpdate: (evt: { type: string; data: unknown }) => {
        if (!evt || !evt.data) return;
        const items = Array.isArray(evt.data) ? evt.data : [evt.data];

        for (const item of items) {
          const payloadRaw = (item as { decodedPayload?: string }).decodedPayload;
          if (typeof payloadRaw !== 'string') continue;

          // Check which prefix matches
          for (const prefix of prefixes) {
            if (payloadRaw.startsWith(prefix)) {
              onMatch({
                txId: (item as { txid?: string }).txid ?? '',
                blockHash: (item as { blockHash?: string }).blockHash ?? null,
                timestamp: (item as { timestamp?: number }).timestamp ?? null,
                payloadRaw,
                matchedPrefix: prefix,
              });
              break;
            }
          }
        }
      },
    },
  });

  await scanner.indexer?.initDB?.();
  scanner.indexer?.start?.();
  scanner.start(() => {});

  logger.log('[ScannerAdapter] Started watching prefixes:', prefixes);

  return scanner;
}

/**
 * Stop a scanner.
 */
export async function stopScannerAdapter(handle: unknown): Promise<void> {
  const scanner = handle as { stop?: () => void; indexer?: { stop?: () => void } };
  scanner?.indexer?.stop?.();
  scanner?.stop?.();
}
