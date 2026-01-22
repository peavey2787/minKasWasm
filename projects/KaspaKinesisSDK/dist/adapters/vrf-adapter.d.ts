/**
 * VRF adapter — bridges SDK to vrf/core/* and external APIs.
 */
import type { KaspaBlockSource } from '../vrf/kaspa-source';
import type { BtcBlockSource } from '../vrf/btc-source';
import type { QrngSource } from '../vrf/qrng-source';
export interface CollectKaspaBlocksAdapterOptions {
    rpc: unknown;
    count: number;
    timeoutMs: number;
}
export declare function collectKaspaBlocksAdapter(options: CollectKaspaBlocksAdapterOptions): Promise<KaspaBlockSource>;
export interface FetchBtcBlocksAdapterOptions {
    count: number;
    timeoutMs: number;
}
export declare function fetchBtcBlocksAdapter(options: FetchBtcBlocksAdapterOptions): Promise<BtcBlockSource>;
export interface FetchQrngAdapterOptions {
    bytes: number;
    manualInput?: string;
    timeoutMs: number;
}
export declare function fetchQrngAdapter(options: FetchQrngAdapterOptions): Promise<QrngSource>;
//# sourceMappingURL=vrf-adapter.d.ts.map