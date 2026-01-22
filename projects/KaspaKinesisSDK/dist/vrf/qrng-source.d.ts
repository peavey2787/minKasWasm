/**
 * Quantum Random Number Generator (QRNG) entropy source.
 */
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
export declare function fetchQrng(options?: FetchQrngOptions): Promise<QrngSource>;
//# sourceMappingURL=qrng-source.d.ts.map