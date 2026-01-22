/**
 * Kaspa block entropy source.
 */
import type { KinesisClient } from '../client';
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
export declare function fetchKaspaBlocks(options: FetchKaspaBlocksOptions): Promise<KaspaBlockSource>;
//# sourceMappingURL=kaspa-source.d.ts.map