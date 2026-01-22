/**
 * Kaspa RPC adapter — bridges SDK to wrapper/kaspa_client.js
 * This file will be the integration point with the actual WASM wrapper.
 */
import type { NetworkId, Logger } from '../types';
export interface ConnectAdapterOptions {
    network: NetworkId;
    rpcUrl?: string;
    logger: Logger;
}
/**
 * Connect to the Kaspa RPC.
 * Returns the underlying RPC client handle.
 */
export declare function connectAdapter(options: ConnectAdapterOptions): Promise<unknown>;
/**
 * Disconnect from the RPC.
 */
export declare function disconnectAdapter(rpc: unknown): Promise<void>;
//# sourceMappingURL=kaspa-adapter.d.ts.map