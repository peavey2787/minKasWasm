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
export async function connectAdapter(options: ConnectAdapterOptions): Promise<unknown> {
  const { network, rpcUrl, logger } = options;

  // Dynamic import of the wrapper (adjust path as needed when bundling)
  // @ts-expect-error — JS module without types
  const { connect } = await import('../../../../wrapper/kaspa_client.js');

  const rpc = rpcUrl
    ? await connect(rpcUrl, network)
    : await connect(null, network);

  logger.log('[KaspaAdapter] Connected to', network);

  return rpc;
}

/**
 * Disconnect from the RPC.
 */
export async function disconnectAdapter(rpc: unknown): Promise<void> {
  // @ts-expect-error — JS module without types
  const { disconnect } = await import('../../../../wrapper/kaspa_client.js');

  if (typeof disconnect === 'function') {
    await disconnect(rpc);
  }
}
