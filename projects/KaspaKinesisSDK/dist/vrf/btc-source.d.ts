/**
 * Bitcoin block entropy source (fetched from public APIs).
 */
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
export declare function fetchBtcBlocks(options?: FetchBtcBlocksOptions): Promise<BtcBlockSource>;
//# sourceMappingURL=btc-source.d.ts.map