import { createTransactions, kaspaToSompi } from '../../../kas-wasm/kaspa.js';

function isHexEvenLength(s) {
  return typeof s === 'string' && /^[0-9a-fA-F]*$/.test(s) && s.length % 2 === 0;
}

function stringToHexUtf8(str) {
  return Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function parseKasToSompi(amountKas) {
  if (amountKas == null || String(amountKas).trim() === '') return 0n;
  return kaspaToSompi(String(amountKas));
}

export function normalizePayloadToHex(payload) {
  if (!payload) return undefined;
  if (isHexEvenLength(payload)) return payload;
  return stringToHexUtf8(String(payload));
}

export async function buildPendingTx({ entries, toAddress, amountSompi, priorityFeeSompi = 0n, changeAddress, networkId, payload } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('No input entries selected.');
  if (!toAddress) throw new Error('To address is required.');
  if (!changeAddress) throw new Error('Change address is required.');
  if (!networkId) throw new Error('Network id is required.');
  if (amountSompi <= 0n) throw new Error('Send amount must be > 0.');

  const outputs = [{ address: String(toAddress), amount: amountSompi }];
  const payloadHex = normalizePayloadToHex(payload);

  const { transactions } = await createTransactions({
    entries,
    outputs,
    priorityFee: priorityFeeSompi,
    changeAddress: String(changeAddress),
    networkId,
    payload: payloadHex,
  });

  if (!transactions?.length) throw new Error('createTransactions returned no transactions.');

  const pendingTx = transactions[0];

  const summary = {
    id: pendingTx.id,
    mass: pendingTx.mass,
    feeAmount: pendingTx.feeAmount,
    changeAmount: pendingTx.changeAmount,
    minimumSignatures: pendingTx.minimumSignatures,
  };

  // Prefer safe JSON schema (bigints as strings)
  const json = typeof pendingTx.serializeToSafeJSON === 'function' ? pendingTx.serializeToSafeJSON() : pendingTx.toString();

  return { pendingTx, summary, json };
}
