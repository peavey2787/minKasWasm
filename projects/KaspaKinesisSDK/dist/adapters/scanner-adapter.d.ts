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
export declare function createScannerAdapter(options: CreateScannerAdapterOptions): Promise<unknown>;
/**
 * Stop a scanner.
 */
export declare function stopScannerAdapter(handle: unknown): Promise<void>;
//# sourceMappingURL=scanner-adapter.d.ts.map