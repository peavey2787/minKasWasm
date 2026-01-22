/**
 * VRF sub-module — verifiable random function utilities.
 * Fetch entropy from Kaspa blocks, BTC blocks, QRNG, and fold into final output.
 */

export { fetchKaspaBlocks, type KaspaBlockSource } from './kaspa-source';
export { fetchBtcBlocks, type BtcBlockSource } from './btc-source';
export { fetchQrng, type QrngSource } from './qrng-source';
export { fold, type FoldOptions, type FoldResult } from './fold';
