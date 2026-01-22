/**
 * Wallet adapter — bridges SDK to wrapper/wallet_service.js
 */

import type { NetworkId, Logger, BalanceInfo } from '../types';

export interface InitWalletAdapterOptions {
  rpc: unknown;
  network: NetworkId;
  logger: Logger;
  onBalanceChange: (balance: BalanceInfo) => void;
}

export interface CreateWalletAdapterOptions {
  name: string;
  password: string;
}

export interface CreateWalletAdapterResult {
  address: string;
  handle: unknown;
}

let walletHandle: unknown = null;

/**
 * Initialize the wallet service.
 */
export async function initWalletAdapter(options: InitWalletAdapterOptions): Promise<void> {
  const { rpc, network, logger, onBalanceChange } = options;

  // @ts-expect-error — JS module without types
  const { init } = await import('../../../../wrapper/wallet_service.js');

  init({
    rpcClient: rpc,
    networkId: network,
    logger: (...args: unknown[]) => logger.log('[WalletAdapter]', ...args),
    onBalanceChange: (matureBalance: string) => {
      const matureKas = matureBalance;
      const matureSompi = kasToSompi(matureBalance);
      onBalanceChange({
        matureKas,
        pendingKas: '0',
        matureSompi,
        pendingSompi: 0n,
      });
    },
  });
}

/**
 * Create or open a wallet.
 */
export async function createWalletAdapter(
  options: CreateWalletAdapterOptions
): Promise<CreateWalletAdapterResult> {
  const { name, password } = options;

  // @ts-expect-error — JS module without types
  const { createWallet } = await import('../../../../wrapper/wallet_service.js');

  const result = await createWallet({
    password,
    filename: name,
    userHint: 'Kinesis SDK wallet',
    storeMnemonic: false,
    discoverAddresses: true,
  });

  walletHandle = result;

  return {
    address: result.address,
    handle: result,
  };
}

/**
 * Get current balance.
 */
export async function getBalanceAdapter(): Promise<BalanceInfo> {
  // @ts-expect-error — JS module without types
  const { getSpendableBalance } = await import('../../../../wrapper/wallet_service.js');

  const matureKas = await getSpendableBalance();

  return {
    matureKas: String(matureKas),
    pendingKas: '0',
    matureSompi: kasToSompi(String(matureKas)),
    pendingSompi: 0n,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function kasToSompi(kas: string): bigint {
  try {
    const parts = kas.split('.');
    const whole = BigInt(parts[0] || '0');
    let frac = parts[1] || '';
    frac = frac.padEnd(8, '0').slice(0, 8);
    return whole * 100_000_000n + BigInt(frac);
  } catch {
    return 0n;
  }
}
