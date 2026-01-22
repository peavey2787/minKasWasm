/**
 * Shared types used across the SDK.
 */
/** Supported Kaspa networks */
export type NetworkId = 'mainnet' | 'testnet-10' | 'testnet-11' | 'testnet-12';
/** Payload filter for the observer */
export interface PayloadFilter {
    /** Match payloads that start with this prefix */
    prefix: string;
}
/** Generic logger interface (console-compatible) */
export interface Logger {
    log(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
/** Balance info returned by the wallet */
export interface BalanceInfo {
    /** Mature (spendable) balance in KAS */
    matureKas: string;
    /** Pending balance in KAS */
    pendingKas: string;
    /** Raw mature balance in sompi */
    matureSompi: bigint;
    /** Raw pending balance in sompi */
    pendingSompi: bigint;
}
/** Transaction ID (hex string) */
export type TxId = string;
/** Block hash (hex string) */
export type BlockHash = string;
//# sourceMappingURL=types.d.ts.map