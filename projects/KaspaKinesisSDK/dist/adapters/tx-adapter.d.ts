/**
 * Transaction adapter — bridges SDK to wrapper/wallet_service.js send()
 */
import type { TxId } from '../types';
export interface SendAdapterOptions {
    amountKas: string;
    toAddress: string;
    payload: string | null;
    wallet: unknown;
}
export interface SendAdapterResult {
    txId: TxId;
}
/**
 * Send a transaction using the wallet service.
 */
export declare function sendAdapter(options: SendAdapterOptions): Promise<SendAdapterResult>;
//# sourceMappingURL=tx-adapter.d.ts.map