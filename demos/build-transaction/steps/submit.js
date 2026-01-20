import { PrivateKey } from '../../../kas-wasm/kaspa.js';

export async function signPendingTx({ pendingTx, keys } = {}) {
  if (!pendingTx) throw new Error('signPendingTx: pendingTx required');
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('signPendingTx: keys required');

  const wasmKeys = keys.map((k) => (k instanceof PrivateKey ? k : new PrivateKey(String(k))));
  await pendingTx.sign(wasmKeys);
}

export async function submitPendingTx({ pendingTx, client } = {}) {
  if (!pendingTx) throw new Error('submitPendingTx: pendingTx required');
  if (!client) throw new Error('submitPendingTx: client required');

  const txid = await pendingTx.submit(client);
  return { txid };
}
