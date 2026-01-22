/**
 * @minkas/kinesis-sdk
 *
 * High-level SDK for Kaspa applications.
 * Downstream devs can connect, transact, observe payload events, and generate
 * verifiable randomness — without understanding blockDAGs, UTXOs, or WASM internals.
 */

// ─── Public API ───────────────────────────────────────────────────────────────

export { createClient, type KinesisClient, type ClientOptions } from './client';
export { createWallet, type KinesisWallet, type WalletOptions } from './wallet';
export { createSender, type KinesisSender, type SenderOptions, type SendResult } from './sender';
export { createObserver, type KinesisObserver, type ObserverOptions, type ObservedEvent } from './observer';

// VRF sub-module
export * as vrf from './vrf';

// Error codes
export { KinesisErrorCode, KinesisError } from './errors';

// Types re-exported for convenience
export type { NetworkId } from './types';
