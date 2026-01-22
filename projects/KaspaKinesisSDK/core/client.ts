/**
 * KinesisClient — high-level Kaspa RPC connection.
 * Wraps the low-level WASM RPC client and exposes a simple interface.
 */

import type { NetworkId, Logger } from './types';
import { KinesisError } from './errors';

// ─── Adapter placeholder ──────────────────────────────────────────────────────
// These will be wired to the actual wrapper/kaspa_client.js at runtime.
// For now we define the shape; implementation follows in adapters/.

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

/** Internal state */
interface ClientState {
  connected: boolean;
  network: NetworkId;
  rpc: unknown;
  logger: Logger;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create and connect a KinesisClient.
 *
 * @example
 * ```ts
 * const client = await createClient({ network: 'testnet-10' });
 * ```
 */
export async function createClient(options: ClientOptions): Promise<KinesisClient> {
  const { network, rpcUrl, logger = console } = options;

  // Dynamic import of the adapter (keeps SDK tree-shakable and avoids top-level await issues)
  const { connectAdapter } = await import('./adapters/kaspa-adapter');

  const rpc = await connectAdapter({ network, rpcUrl, logger });

  const state: ClientState = {
    connected: true,
    network,
    rpc,
    logger,
  };

  const client: KinesisClient = {
    get connected() {
      return state.connected;
    },
    get network() {
      return state.network;
    },
    get rpc() {
      return state.rpc;
    },

    async disconnect() {
      if (!state.connected) return;
      try {
        const { disconnectAdapter } = await import('./adapters/kaspa-adapter');
        await disconnectAdapter(state.rpc);
      } catch (e) {
        state.logger.warn('[KinesisClient] disconnect error', e);
      }
      state.connected = false;
    },
  };

  return client;
}
