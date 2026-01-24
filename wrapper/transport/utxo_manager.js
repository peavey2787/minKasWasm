import { kaspaToSompi } from "../kas-wasm/kaspa.js";

/**
 * Normalize UTXO result to a flat array of entries.
 * Wallet RPC commonly returns either:
 *  - Array<entry>
 *  - { entries: Array<entry> }
 */
export function normalizeUtxoEntries(utxoResult) {
  if (Array.isArray(utxoResult)) return utxoResult;
  if (Array.isArray(utxoResult?.entries)) return utxoResult.entries;
  if (Array.isArray(utxoResult?.utxoEntries)) return utxoResult.utxoEntries;
  return [];
}

export function entryAmountSompi(entry) {
  const v =
    entry?.amount ??
    entry?.utxoEntry?.amount ??
    entry?.utxo?.amount ??
    entry?.output?.amount ??
    null;

  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && v.trim() !== "") return BigInt(v);
  return 0n;
}

/**
 * Fetch UTXOs for an account's receive+change addresses using wallet.rpc.getUtxosByAddresses(addresses).
 * @returns {Promise<{ receiveAddress: string, changeAddress: string, entries: Array }>}
 */
export async function getAccountUtxos({
  wallet,
  accountDescriptor,
  logger,
} = {}) {
  if (!wallet) throw new Error("getAccountUtxos: wallet is required.");
  if (!accountDescriptor)
    throw new Error("getAccountUtxos: accountDescriptor is required.");
  if (!wallet.rpc?.getUtxosByAddresses)
    throw new Error(
      "getAccountUtxos: wallet.rpc.getUtxosByAddresses not available.",
    );

  const log = typeof logger === "function" ? logger : () => {};

  const receiveAddress = String(accountDescriptor.receiveAddress || "");
  const changeAddress = String(accountDescriptor.changeAddress || "");

  const addresses = [receiveAddress, changeAddress].filter(Boolean);
  if (addresses.length === 0)
    throw new Error("No receive/change address available for this account.");

  log(`Fetching UTXOs for: ${addresses.join(", ")}`);
  const utxoResult = await wallet.rpc.getUtxosByAddresses(addresses);
  const entries = normalizeUtxoEntries(utxoResult);

  return { receiveAddress, changeAddress, entries };
}

/**
 * Largest-first selection: minimizes number of inputs (usually best for mass).
 * Note: This does NOT account for fees; use Generator/estimate or try-build loop.
 */
export function selectUtxosLargestFirst(
  entries,
  { targetSompi = 0n, maxInputs = 50 } = {},
) {
  const sorted = [...(entries || [])].sort((a, b) => {
    const aa = entryAmountSompi(a);
    const bb = entryAmountSompi(b);
    return aa === bb ? 0 : aa > bb ? -1 : 1;
  });

  const selected = [];
  let total = 0n;

  for (const e of sorted) {
    if (selected.length >= maxInputs) break;
    const amt = entryAmountSompi(e);
    if (amt <= 0n) continue;
    selected.push(e);
    total += amt;
    if (total >= targetSompi) break;
  }

  return { selected, total };
}

/**
 * Convenience helper for parsing KAS string to sompi bigint.
 */
export function kasToSompi(amountKas) {
  return kaspaToSompi(String(amountKas));
}
