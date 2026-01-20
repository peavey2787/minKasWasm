import { sompiToKaspaString } from '../../../kas-wasm/kaspa.js';
import { normalizeUtxoEntries, entryAmountSompi } from '../../../wrapper/utxo_manager.js';

function normalizeOutpoint(entry, fallbackIndex = 0) {
  const op =
    entry?.outpoint ??
    entry?.utxoEntry?.outpoint ??
    entry?.utxo?.outpoint ??
    entry?.output?.outpoint ??
    null;

  if (typeof op === 'string' && op) return op;

  const txid = op?.transactionId ?? op?.txid ?? entry?.transactionId ?? entry?.txid ?? null;
  const index = op?.index ?? op?.outputIndex ?? entry?.index ?? entry?.outputIndex ?? null;
  if (txid != null && index != null) return `${txid}:${index}`;

  return `unknown:${fallbackIndex}`;
}

function inferAddress(entry) {
  return (
    entry?.address ??
    entry?.utxoEntry?.address ??
    entry?.utxo?.address ??
    entry?.output?.address ??
    null
  );
}

export function computeUtxoStats(normalized) {
  const amounts = (normalized || []).map((e) => e.amountSompi).filter((v) => typeof v === 'bigint' && v > 0n);
  amounts.sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));

  const count = amounts.length;
  const totalSompi = amounts.reduce((acc, v) => acc + v, 0n);
  const minSompi = count ? amounts[0] : 0n;
  const maxSompi = count ? amounts[count - 1] : 0n;
  const medianSompi = count ? amounts[Math.floor((count - 1) / 2)] : 0n;

  return { count, totalSompi, minSompi, maxSompi, medianSompi };
}

export function formatEntryForLog(e) {
  return `${sompiToKaspaString(e.amountSompi)} KAS | ${e.outpoint} | ${e.addressKind}`;
}

export async function fetchAccountUtxos({ wallet, receiveAddress, changeAddress, includeReceive = true, includeChange = true, logger } = {}) {
  if (!wallet?.rpc?.getUtxosByAddresses) throw new Error('wallet.rpc.getUtxosByAddresses is not available');

  const log = typeof logger === 'function' ? logger : () => {};

  const addresses = [];
  if (includeReceive && receiveAddress) addresses.push(String(receiveAddress));
  if (includeChange && changeAddress) addresses.push(String(changeAddress));
  if (addresses.length === 0) throw new Error('No addresses selected for UTXO fetch.');

  log(`Fetching UTXOs for ${addresses.length} address(es)...`);
  const utxoResult = await wallet.rpc.getUtxosByAddresses(addresses);
  const entries = normalizeUtxoEntries(utxoResult);

  const normalized = entries.map((entry, idx) => {
    const amountSompi = entryAmountSompi(entry);
    const outpoint = normalizeOutpoint(entry, idx);
    const addr = inferAddress(entry);

    let addressKind = 'unknown';
    if (addr && receiveAddress && String(addr) === String(receiveAddress)) addressKind = 'receive';
    if (addr && changeAddress && String(addr) === String(changeAddress)) addressKind = 'change';

    return {
      raw: entry,
      amountSompi,
      outpoint,
      addressKind,
      address: addr ? String(addr) : null,
    };
  });

  const stats = computeUtxoStats(normalized);
  log(`Fetched ${stats.count} UTXO(s). Total: ${sompiToKaspaString(stats.totalSompi)} KAS`);

  return { normalized, stats };
}
