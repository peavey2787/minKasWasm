/**
 * KinesisWallet — high-level wallet abstraction.
 * Wraps wallet_service.js and exposes address/balance/signing without UTXO details.
 */

import type { NetworkId, Logger, BalanceInfo } from './types';
import { KinesisError } from './errors';
import type { KinesisClient } from './client';

export interface WalletOptions {
  /** The connected client */
  client: KinesisClient;
  /** Wallet file name (used for storage key) */
  name: string;
  /** Wallet password */
  password: string;
  /** Optional logger */
  logger?: Logger;
}

export interface KinesisWallet {
  /** Wallet is ready for use */
  readonly ready: boolean;
  /** Receive address */
  readonly address: string;
  /** Get current balance info */
  getBalance(): Promise<BalanceInfo>;
  /** Subscribe to balance changes */
  onBalanceChange(cb: (balance: BalanceInfo) => void): () => void;
  /** Lock/close the wallet */
  close(): Promise<void>;
  /** Underlying wallet handle (escape hatch) */
  readonly handle: unknown;
}

interface WalletState {
  ready: boolean;
  address: string;
  handle: unknown;
  balanceCallbacks: Set<(balance: BalanceInfo) => void>;
  lastBalance: BalanceInfo | null;
  logger: Logger;
}

/**
 * Create or open a wallet.
 *
 * @example
 * ```ts
 * const wallet = await createWallet({ client, name: 'game', password: '1234' });
 * console.log(wallet.address);
 * ```
 */
export async function createWallet(options: WalletOptions): Promise<KinesisWallet> {
  const { client, name, password, logger = console } = options;

  if (!client.connected) {
    throw KinesisError.notConnected('Cannot create wallet: client not connected');
  }

  const { initWalletAdapter, createWalletAdapter, getBalanceAdapter } = await import('./adapters/wallet-adapter');

  const balanceCallbacks = new Set<(balance: BalanceInfo) => void>();

  // Adapter's onBalanceChange will call this
  const handleBalanceChange = (balance: BalanceInfo) => {
    state.lastBalance = balance;
    for (const cb of balanceCallbacks) {
      try {
        cb(balance);
      } catch {
        // ignore callback errors
      }
    }
  };

  await initWalletAdapter({
    rpc: client.rpc,
    network: client.network,
    logger,
    onBalanceChange: handleBalanceChange,
  });

  const { address, handle } = await createWalletAdapter({
    name,
    password,
  });

  const state: WalletState = {
    ready: true,
    address,
    handle,
    balanceCallbacks,
    lastBalance: null,
    logger,
  };

  const wallet: KinesisWallet = {
    get ready() {
      return state.ready;
    },
    get address() {
      return state.address;
    },
    get handle() {
      return state.handle;
    },

    async getBalance(): Promise<BalanceInfo> {
      if (!state.ready) throw KinesisError.walletLocked();
      if (state.lastBalance) return state.lastBalance;
      const balance = await getBalanceAdapter();
      state.lastBalance = balance;
      return balance;
    },

    onBalanceChange(cb) {
      state.balanceCallbacks.add(cb);
      return () => {
        state.balanceCallbacks.delete(cb);
      };
    },

    async close() {
      state.ready = false;
      state.balanceCallbacks.clear();
      // Adapter close logic could go here
    },
  };

  return wallet;
}
