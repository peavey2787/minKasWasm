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
export async function sendAdapter(options: SendAdapterOptions): Promise<SendAdapterResult> {
  const { amountKas, toAddress, payload } = options;

  // @ts-expect-error — JS module without types
  const { send } = await import('../../../../wrapper/wallet_service.js');

  const result = await send({
    amount: amountKas,
    toAddress,
    payload: payload ?? undefined,
  });

  // The wrapper returns txid or similar
  const txId = result?.txid ?? result?.transactionId ?? result?.id ?? String(result);

  return { txId };
}
