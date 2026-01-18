// Shared live helpers for wallet tests (no mocks).
// IMPORTANT: Do NOT cache-bust imports of wrapper/ or kas-wasm/ modules.
// Cache-busting (adding ?v=...) creates a new ES module instance, which can
// create a second WASM instance and break WASM-backed objects (e.g. UTXO entries
// containing __wbg_ptr) when passed across instances.

export function normalizeAddress(addr) {
  if (typeof addr === 'string') return addr;
  if (addr && typeof addr === 'object' && typeof addr.toString === 'function') {
    const s = addr.toString();
    if (typeof s === 'string') return s;
  }
  return null;
}

export function mkTestName(prefix) {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1e6);
  return `${prefix}_${ts}_${rand}`;
}

// A tiny balance-event fanout so the funding modal can subscribe.
const balanceListeners = new Set();

export function subscribeBalance({ onUpdate } = {}) {
  if (typeof onUpdate !== 'function') return () => {};
  balanceListeners.add(onUpdate);
  return () => balanceListeners.delete(onUpdate);
}

function emitBalanceUpdate() {
  for (const fn of balanceListeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

let walletServiceModulePromise = null;

export async function getWalletServiceSingleton() {
  if (!walletServiceModulePromise) {
    walletServiceModulePromise = import('../../wrapper/wallet_service.js');
  }
  return await walletServiceModulePromise;
}

export async function ensureConnected(ctx) {
  const effective = ctx || window.walletTestContext;
  if (!effective || !effective.rpcClient || !effective.networkId) {
    throw new Error('Not connected. Use the dashboard Connect button first.');
  }
  return effective;
}

export async function ensureWalletInitialized({ ctx, logFn = null } = {}) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  const effective = await ensureConnected(ctx);
  const walletService = await getWalletServiceSingleton();

  walletService.init({
    rpcClient: effective.rpcClient,
    networkId: effective.networkId,
    logger: (...args) => log('[WALLET] ' + args.map((a) => (a == null ? '' : String(a))).join(' ')),
    onBalanceChange: (kasStr) => {
      log(`[EVENT] balance: ${kasStr} KAS`);
      emitBalanceUpdate();
    },
  });

  return { walletService, ctx: effective };
}

function sharedKey(networkId, suffix) {
  return `wallet_test_shared_${suffix}_${networkId}`;
}

export function getSharedWalletConfig(networkId) {
  const filenameKey = sharedKey(networkId, 'filename');
  const passwordKey = sharedKey(networkId, 'password');

  let sharedFilename = localStorage.getItem(filenameKey);
  if (!sharedFilename) {
    sharedFilename = `wallet_tests_shared_${networkId}`;
    localStorage.setItem(filenameKey, sharedFilename);
  }

  let sharedPassword = localStorage.getItem(passwordKey);
  if (!sharedPassword) {
    sharedPassword = 'wallet-tests-password';
    localStorage.setItem(passwordKey, sharedPassword);
  }

  return { filename: sharedFilename, password: sharedPassword };
}

export async function getOrCreateSharedWallet({ ctx, logFn = null, discoverAddresses = false, storeMnemonic = false } = {}) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  const { walletService, ctx: effective } = await ensureWalletInitialized({ ctx, logFn });
  const { filename, password } = getSharedWalletConfig(effective.networkId);

  log(`[INFO] Using shared wallet: ${filename}`);

  const result = await walletService.createWallet({
    password,
    filename,
    userHint: 'wallet tests (shared)',
    storeMnemonic,
    discoverAddresses,
  });

  const address = normalizeAddress(result?.address);
  if (!address) {
    log(`[DEBUG] createWallet().address type=${typeof result?.address}`);
    try { log('[DEBUG] createWallet() result: ' + JSON.stringify(result)); } catch { /* ignore */ }
    throw new Error('createWallet() did not return an address');
  }

  return { walletService, ctx: effective, filename, password, result, address };
}

export async function ensureSpendableOrPrompt({ address, minSompi, getSpendableSompi, logFn = null } = {}) {
  const { awaitFunding } = await import('./funding_modal.js');
  const required = typeof minSompi === 'bigint' ? minSompi : BigInt(minSompi);
  const spendableNow = await getSpendableSompi();
  const spendableBig = typeof spendableNow === 'bigint' ? spendableNow : BigInt(spendableNow);
  if (spendableBig >= required) return spendableBig;

  await awaitFunding({
    address,
    minSompi: required,
    getSpendableSompi,
    subscribe: ({ onUpdate }) => subscribeBalance({ onUpdate }),
    logFn,
    title: 'Funding required (wallet tests)',
    hint: 'Fund the shared test wallet address below. All funding-gated tests reuse this wallet, so you only need to fund once.',
  });

  const after = await getSpendableSompi();
  return typeof after === 'bigint' ? after : BigInt(after);
}

export async function createEphemeralWallet({ ctx, password = 'test-password', filename = null, discoverAddresses = false, storeMnemonic = false, logFn = null } = {}) {
  const { walletService, ctx: effective } = await ensureWalletInitialized({ ctx, logFn });
  const fn = filename || mkTestName('wallet_test');
  const result = await walletService.createWallet({
    password,
    filename: fn,
    storeMnemonic,
    discoverAddresses,
    userHint: 'wallet tests',
  });

  return { walletService, ctx: effective, filename: fn, password, result };
}
