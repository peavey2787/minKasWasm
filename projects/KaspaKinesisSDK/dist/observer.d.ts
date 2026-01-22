/**
 * KinesisObserver — payload-prefix based event stream.
 * Wraps the scanner/indexer and emits decoded application events.
 */
import type { Logger, PayloadFilter, TxId, BlockHash } from './types';
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
export declare function createObserver(options: ObserverOptions): KinesisObserver;
export {};
//# sourceMappingURL=observer.d.ts.map