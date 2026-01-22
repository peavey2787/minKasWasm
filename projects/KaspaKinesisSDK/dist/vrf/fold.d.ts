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
export declare function fold(options: FoldOptions): Promise<FoldResult>;
//# sourceMappingURL=fold.d.ts.map