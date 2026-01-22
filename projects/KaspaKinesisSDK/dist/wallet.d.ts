/**
 * KinesisWallet — high-level wallet abstraction.
 * Wraps wallet_service.js and exposes address/balance/signing without UTXO details.
 */
import type { Logger, BalanceInfo } from './types';
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
/**
 * Create or open a wallet.
 *
 * @example
 * ```ts
 * const wallet = await createWallet({ client, name: 'game', password: '1234' });
 * console.log(wallet.address);
 * ```
 */
export declare function createWallet(options: WalletOptions): Promise<KinesisWallet>;
//# sourceMappingURL=wallet.d.ts.map