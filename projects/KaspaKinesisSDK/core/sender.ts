/**
 * KinesisSender — high-level transaction sender.
 * Handles backlog bundling, backoff, and payload size limits.
 */

import type { Logger, TxId } from './types';
import { KinesisError, KinesisErrorCode } from './errors';
import type { KinesisClient } from './client';
import type { KinesisWallet } from './wallet';

/** Maximum payload size in bytes */
const MAX_PAYLOAD_BYTES = 32 * 1024;

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

interface SenderState {
  client: KinesisClient;
  wallet: KinesisWallet;
  defaultTo: string;
  logger: Logger;
  backlog: string[];
  inFlight: boolean;
}

function utf8Len(s: string): number {
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length;
  }
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
export function createSender(options: SenderOptions): KinesisSender {
  const { client, wallet, toAddress = '', logger = console } = options;

  const state: SenderState = {
    client,
    wallet,
    defaultTo: toAddress,
    logger,
    backlog: [],
    inFlight: false,
  };

  async function send(params: SendParams): Promise<SendResult> {
    if (!state.client.connected) throw KinesisError.notConnected();
    if (!state.wallet.ready) throw KinesisError.walletLocked();

    const to = params.toAddress || state.defaultTo;
    if (!to) throw new KinesisError(KinesisErrorCode.UNKNOWN, 'No recipient address specified');

    const payload = params.payload ?? null;

    // Check payload size
    if (payload && utf8Len(payload) > MAX_PAYLOAD_BYTES) {
      throw KinesisError.payloadTooLarge(`Payload is ${utf8Len(payload)} bytes; max is ${MAX_PAYLOAD_BYTES}`);
    }

    // If there's a current payload, add to backlog (it may get bundled on retry)
    if (payload) {
      state.backlog.push(payload);
    }

    // Wait if another send is in flight (simple mutex)
    while (state.inFlight) {
      await sleep(50);
    }

    state.inFlight = true;

    try {
      const { sendAdapter } = await import('./adapters/tx-adapter');

      // Attempt to send; if it fails transiently, keep backlog for next attempt
      const result = await sendAdapter({
        amountKas: params.amountKas,
        toAddress: to,
        payload: buildBundledPayload(state.backlog),
        wallet: state.wallet.handle,
      });

      // Success: clear backlog
      const sentPayload = buildBundledPayload(state.backlog);
      state.backlog = [];

      return { txId: result.txId, payload: sentPayload };
    } catch (err) {
      // Classify error
      const msg = String((err as Error)?.message ?? err);

      if (/insufficient|not enough|balance|fund/i.test(msg)) {
        throw KinesisError.insufficientFunds(msg);
      }
      if (/storage.mass|policy|dust/i.test(msg)) {
        throw KinesisError.policyRejected(msg, err);
      }
      if (/rate|busy|limit/i.test(msg)) {
        throw KinesisError.rateLimited(msg);
      }

      throw KinesisError.unknown(msg, err);
    } finally {
      state.inFlight = false;
    }
  }

  return {
    send,
    get backlogSize() {
      return state.backlog.length;
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildBundledPayload(backlog: string[]): string | null {
  if (backlog.length === 0) return null;
  if (backlog.length === 1) return backlog[0];
  // For multiple, bundle as JSON array (simple approach; apps can parse)
  const bundled = JSON.stringify(backlog);
  if (utf8Len(bundled) > MAX_PAYLOAD_BYTES) {
    // If too large, just send the latest and keep the rest
    return backlog[backlog.length - 1];
  }
  return bundled;
}
