import { createTransactions, Generator, PrivateKey, sompiToKaspaString } from '../../kas-wasm/kaspa.js';
import { payloadToHex } from '../utilities/utilities.js';

/**
 * Estimate mass/fees for a prospective transaction using the WASM Generator.
 * Generic + reusable: caller provides UTXO entries + outputs + changeAddress.
 */
export async function estimateTransaction({
  entries,
  outputs,
  priorityFee = 0n,
  changeAddress,
  networkId,
  payload, // string (utf8 or hex)
} = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('estimateTransaction: entries required.');
  if (!Array.isArray(outputs) || outputs.length === 0) throw new Error('estimateTransaction: outputs required.');
  if (!changeAddress) throw new Error('estimateTransaction: changeAddress required.');
  if (!networkId) throw new Error('estimateTransaction: networkId required.');

  const payloadHex = payloadToHex(payload);

  const settings = {
    // SDK examples commonly use utxoEntries; some wrappers also pass entries.
    utxoEntries: entries,
    entries,
    outputs,
    changeAddress: String(changeAddress),
    priorityFee,
    payload: payloadHex,
    networkId,
  };

  let generator;
  try {
    generator = new Generator(settings);
    const summary = await generator.estimate();

    const fees = summary?.fees ?? 0n;
    const mass = summary?.mass ?? 0n;
    const finalAmount = summary?.finalAmount;
    const txCount = summary?.transactions ?? 0;
    const utxoCount = summary?.utxos ?? 0;
    const finalTransactionId = summary?.finalTransactionId;

    // free WASM summary if available
    try { summary?.free?.(); } catch { /* ignore */ }

    const baseFee = fees - (priorityFee ?? 0n);

    return {
      mass,
      fees,
      feesKas: sompiToKaspaString(fees),
      priorityFee,
      baseFee,
      baseFeeKas: sompiToKaspaString(baseFee),
      finalAmount,
      finalAmountKas: finalAmount != null ? sompiToKaspaString(finalAmount) : null,
      transactions: txCount,
      utxos: utxoCount,
      finalTransactionId: finalTransactionId ?? null,
      payloadBytes: payloadHex ? Math.floor(payloadHex.length / 2) : 0,
    };
  } finally {
    try { generator?.free?.(); } catch { /* ignore */ }
  }
}

/**
 * Attempt to sign a PendingTransaction with keys.
 * Some builds accept WASM PrivateKey objects, others accept strings.
 */
export async function signPendingTransaction(pendingTx, privateKeys) {
  if (!pendingTx?.sign) throw new Error('PendingTransaction.sign is not available.');

  const keys = Array.isArray(privateKeys) ? privateKeys : [];
  if (keys.length === 0) throw new Error('No private keys provided for signing.');

  // Prefer WASM PrivateKey objects
  try {
    const wasmKeys = keys.map((k) => (k instanceof PrivateKey ? k : new PrivateKey(String(k))));
    await pendingTx.sign(wasmKeys);
    return;
  } catch {
    // Fallback: try hex strings
    await pendingTx.sign(keys.map((k) => String(k)));
  }
}

/**
 * Build transactions via WASM createTransactions.
 * Returns the first PendingTransaction (common case).
 */
export async function buildPendingTransaction({
  entries,
  outputs,
  priorityFee = 0n,
  changeAddress,
  networkId,
  payload, // string (utf8 or hex)
} = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('buildPendingTransaction: entries required.');
  if (!Array.isArray(outputs) || outputs.length === 0) throw new Error('buildPendingTransaction: outputs required.');
  if (!changeAddress) throw new Error('buildPendingTransaction: changeAddress required.');
  if (!networkId) throw new Error('buildPendingTransaction: networkId required.');

  const payloadHex = payloadToHex(payload);

  const { transactions } = await createTransactions({
    entries,
    outputs,
    priorityFee,
    changeAddress: String(changeAddress),
    networkId,
    payload: payloadHex,
  });

  if (!transactions || transactions.length === 0) {
    throw new Error('Failed to create transactions (empty result).');
  }

  return transactions[0];
}

/**
 * Sign + submit a pending transaction.
 * Returns a normalized result with txid if available.
 */
export async function submitPendingTransaction({ pendingTx, privateKeys } = {}) {
  if (!pendingTx) throw new Error('submitPendingTransaction: pendingTx required.');

  await signPendingTransaction(pendingTx, privateKeys);

  if (typeof pendingTx.submit !== 'function') {
    throw new Error('PendingTransaction.submit is not available in this WASM build.');
  }

  const submitRes = await pendingTx.submit();
  const txid = pendingTx.id ?? submitRes?.transactionId ?? submitRes?.txid ?? null;

  return { txid, submitRes, pendingTx };
}

/**
 * One-shot convenience: build + sign + submit.
 */
export async function buildSignSubmitTransaction({
  entries,
  outputs,
  priorityFee = 0n,
  changeAddress,
  networkId,
  payload,
  privateKeys,
} = {}) {
  const pendingTx = await buildPendingTransaction({
    entries,
    outputs,
    priorityFee,
    changeAddress,
    networkId,
    payload,
  });

  return await submitPendingTransaction({ pendingTx, privateKeys });
}