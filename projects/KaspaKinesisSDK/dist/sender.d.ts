/**
 * KinesisSender — high-level transaction sender.
 * Handles backlog bundling, backoff, and payload size limits.
 */
import type { Logger, TxId } from './types';
import type { KinesisClient } from './client';
import type { KinesisWallet } from './wallet';
export interface SenderOptions {
    /** Connected client */
    client: KinesisClient;
    /** Wallet to send from */
    wallet: KinesisWallet;
    /** Default recipient address (can be overridden per-send) */
    toAddress?: string;
    /** Optional logger */
    logger?: Logger;
}
export interface SendParams {
    /** Amount in KAS (string to avoid float precision issues) */
    amountKas: string;
    /** Recipient address (defaults to sender options) */
    toAddress?: string;
    /** Optional payload string */
    payload?: string;
}
export interface SendResult {
    /** Transaction ID */
    txId: TxId;
    /** Payload that was sent (may differ if bundled) */
    payload: string | null;
}
export interface KinesisSender {
    /** Send a transaction */
    send(params: SendParams): Promise<SendResult>;
    /** Number of payloads currently queued (backlog) */
    readonly backlogSize: number;
}
/**
 * Create a sender bound to a client and wallet.
 *
 * @example
 * ```ts
 * const sender = createSender({ client, wallet, toAddress: wallet.address });
 * const result = await sender.send({ amountKas: '1', payload: 'hello' });
 * ```
 */
export declare function createSender(options: SenderOptions): KinesisSender;
//# sourceMappingURL=sender.d.ts.map