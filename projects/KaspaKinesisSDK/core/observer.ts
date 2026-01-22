/**
 * KinesisObserver — payload-prefix based event stream.
 * Wraps the scanner/indexer and emits decoded application events.
 */

import type { Logger, PayloadFilter, TxId, BlockHash } from './types';
import { KinesisError, KinesisErrorCode } from './errors';
import type { KinesisClient } from './client';

export interface ObserverOptions {
  /** Connected client */
  client: KinesisClient;
  /** Payload filters (prefix-based) */
  filters: PayloadFilter[];
  /** Optional logger */
  logger?: Logger;
}

export interface ObservedEvent {
  /** Transaction ID */
  txId: TxId;
  /** Block hash (if available) */
  blockHash: BlockHash | null;
  /** Timestamp (ms since epoch, if available) */
  timestamp: number | null;
  /** Raw decoded payload string */
  payloadRaw: string;
  /** Parsed payload (JSON object) or null if not JSON */
  payloadParsed: unknown;
  /** Which prefix matched */
  matchedPrefix: string;
}

type EventCallback = (event: ObservedEvent) => void;

export interface KinesisObserver {
  /** Start observing */
  start(): Promise<void>;
  /** Stop observing */
  stop(): void;
  /** Subscribe to events */
  on(event: 'event', callback: EventCallback): () => void;
  /** Whether the observer is running */
  readonly running: boolean;
}

interface ObserverState {
  client: KinesisClient;
  filters: PayloadFilter[];
  logger: Logger;
  running: boolean;
  callbacks: Set<EventCallback>;
  scannerHandle: unknown;
}

/**
 * Create an observer for payload-prefix events.
 *
 * @example
 * ```ts
 * const observer = createObserver({
 *   client,
 *   filters: [{ prefix: 'anticheat:move:' }],
 * });
 * observer.on('event', (e) => console.log(e.payloadParsed));
 * await observer.start();
 * ```
 */
export function createObserver(options: ObserverOptions): KinesisObserver {
  const { client, filters, logger = console } = options;

  const state: ObserverState = {
    client,
    filters,
    logger,
    running: false,
    callbacks: new Set(),
    scannerHandle: null,
  };

  function emit(event: ObservedEvent) {
    for (const cb of state.callbacks) {
      try {
        cb(event);
      } catch (e) {
        state.logger.warn('[KinesisObserver] callback error', e);
      }
    }
  }

  async function start() {
    if (!state.client.connected) throw KinesisError.notConnected();
    if (state.running) return;

    const { createScannerAdapter } = await import('./adapters/scanner-adapter');

    const prefixes = state.filters.map((f) => f.prefix);

    state.scannerHandle = await createScannerAdapter({
      rpc: state.client.rpc,
      prefixes,
      onMatch: (match: {
        txId: string;
        blockHash: string | null;
        timestamp: number | null;
        payloadRaw: string;
        matchedPrefix: string;
      }) => {
        let payloadParsed: unknown = null;
        const prefixLen = match.matchedPrefix.length;
        const jsonPart = match.payloadRaw.slice(prefixLen);
        try {
          payloadParsed = JSON.parse(jsonPart);
        } catch {
          // not JSON
        }

        emit({
          txId: match.txId,
          blockHash: match.blockHash,
          timestamp: match.timestamp,
          payloadRaw: match.payloadRaw,
          payloadParsed,
          matchedPrefix: match.matchedPrefix,
        });
      },
      logger: state.logger,
    });

    state.running = true;
  }

  function stop() {
    if (!state.running) return;
    // Adapter stop logic
    (async () => {
      try {
        const { stopScannerAdapter } = await import('./adapters/scanner-adapter');
        await stopScannerAdapter(state.scannerHandle);
      } catch (e) {
        state.logger.warn('[KinesisObserver] stop error', e);
      }
    })();
    state.running = false;
  }

  function on(_event: 'event', callback: EventCallback): () => void {
    state.callbacks.add(callback);
    return () => {
      state.callbacks.delete(callback);
    };
  }

  return {
    start,
    stop,
    on,
    get running() {
      return state.running;
    },
  };
}
