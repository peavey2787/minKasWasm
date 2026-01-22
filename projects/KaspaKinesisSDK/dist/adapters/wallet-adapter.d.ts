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
/**
 * Initialize the wallet service.
 */
export declare function initWalletAdapter(options: InitWalletAdapterOptions): Promise<void>;
/**
 * Create or open a wallet.
 */
export declare function createWalletAdapter(options: CreateWalletAdapterOptions): Promise<CreateWalletAdapterResult>;
/**
 * Get current balance.
 */
export declare function getBalanceAdapter(): Promise<BalanceInfo>;
//# sourceMappingURL=wallet-adapter.d.ts.map