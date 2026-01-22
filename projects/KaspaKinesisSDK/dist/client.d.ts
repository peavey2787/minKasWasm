/**
 * KinesisClient — high-level Kaspa RPC connection.
 * Wraps the low-level WASM RPC client and exposes a simple interface.
 */
import type { NetworkId, Logger } from './types';
export interface ClientOptions {
    /** Network to connect to */
    network: NetworkId;
    /** Optional direct RPC URL (if not using public resolver) */
    rpcUrl?: string;
    /** Optional logger */
    logger?: Logger;
}
export interface KinesisClient {
    /** True when RPC is connected and ready */
    readonly connected: boolean;
    /** The network this client is connected to */
    readonly network: NetworkId;
    /** Underlying RPC client (escape hatch for advanced use) */
    readonly rpc: unknown;
    /** Disconnect from the RPC */
    disconnect(): Promise<void>;
}
/**
 * Create and connect a KinesisClient.
 *
 * @example
 * ```ts
 * const client = await createClient({ network: 'testnet-10' });
 * ```
 */
export declare function createClient(options: ClientOptions): Promise<KinesisClient>;
//# sourceMappingURL=client.d.ts.map