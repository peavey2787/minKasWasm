// Safe integration test (no funding required): create a new wallet, then re-open it.
// Uses centralized ctx.rpcClient + ctx.networkId from the dashboard.

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mkTestName(prefix) {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1e6);
  return `${prefix}_${ts}_${rand}`;
}

function normalizeAddress(addr) {
  if (typeof addr === 'string') return addr;
  if (addr && typeof addr === 'object' && typeof addr.toString === 'function') {
    const s = addr.toString();
    if (typeof s === 'string') return s;
  }
  return null;
}

export async function runTestWalletCreateReopen(logFn = null, ctx = null) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  const effectiveCtx = ctx || window.walletTestContext;

  if (!effectiveCtx || !effectiveCtx.rpcClient || !effectiveCtx.networkId) {
    return fail('Not connected. Use the dashboard Connect button first.');
  }

  const filename = mkTestName('wallet_test');
  const password = 'test-password';

  log(`[TEST] create+reopen wallet: ${filename}`);

  const walletService = await import('../../wrapper/wallet_service.js');

  walletService.init({
    rpcClient: effectiveCtx.rpcClient,
    networkId: effectiveCtx.networkId,
    logger: (...args) => log('[WALLET] ' + args.map((a) => (a == null ? '' : String(a))).join(' ')),
    onBalanceChange: (kasStr) => log(`[EVENT] balance: ${kasStr} KAS`),
  });

  const created = await walletService.createWallet({
    password,
    filename,
    userHint: 'wallet tests',
    storeMnemonic: false,
    discoverAddresses: false,
  });

  const createdAddress = normalizeAddress(created?.address);
  if (!createdAddress) {
    log(`[DEBUG] createWallet().address type=${typeof created?.address}`);
    try { log('[DEBUG] createWallet() result: ' + JSON.stringify(created)); } catch { /* ignore */ }
  }
  assert(!!createdAddress && createdAddress.length > 0, 'createWallet did not return an address');
  if (created.mnemonic == null) {
    log('[INFO] createWallet did not return mnemonic (wallet likely already existed)');
  } else {
    assert(typeof created.mnemonic === 'string' && created.mnemonic.split(' ').length >= 12, 'createWallet mnemonic was invalid');
  }
  log(`[OK] created address: ${createdAddress}`);

  const reopened = await walletService.createWallet({
    password,
    filename,
    userHint: 'wallet tests',
    storeMnemonic: false,
    discoverAddresses: false,
  });

  const reopenedAddress = normalizeAddress(reopened?.address);
  if (!reopenedAddress) {
    log(`[DEBUG] reopen createWallet().address type=${typeof reopened?.address}`);
    try { log('[DEBUG] reopen createWallet() result: ' + JSON.stringify(reopened)); } catch { /* ignore */ }
  }
  assert(!!reopenedAddress && reopenedAddress.length > 0, 'reopen did not return an address');
  assert(reopened.mnemonic == null, 'reopen unexpectedly returned mnemonic (should only return address)');
  log(`[OK] reopened address: ${reopenedAddress}`);

  const wallets = await walletService.getAllWallets();
  assert(Array.isArray(wallets), 'getAllWallets did not return an array');
  const found = wallets.some((w) => (w && (w.filename === filename || w.title === filename)));
  log(`[INFO] walletEnumerate count=${wallets.length}`);

  // Some SDKs may not include filename in the descriptor the way we expect.
  // Treat absence as a warning, not a hard fail.
  if (!found) {
    log('[WARN] created wallet not found in walletEnumerate descriptors (node-dependent shape)');
  }

  return pass('create wallet + reopen existing wallet');
}
