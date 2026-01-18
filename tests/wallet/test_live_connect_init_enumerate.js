// Safe integration test: connect to a live node (or resolver), init wallet_service, enumerate wallet descriptors.
// This does NOT create a wallet or require funding.

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

export async function runTestLiveConnectInitEnumerate(logFn = null, ctx = null) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  log('[TEST] Live connect + wallet init + walletEnumerate');

  const effectiveCtx = ctx || window.walletTestContext;
  if (!effectiveCtx || !effectiveCtx.rpcClient || !effectiveCtx.networkId) {
    return fail('Not connected. Use the dashboard Connect button first.');
  }

  const rpcClient = effectiveCtx.rpcClient;
  const networkId = effectiveCtx.networkId;

  const walletService = await import('../../wrapper/wallet_service.js');

  let balanceEvents = 0;
  walletService.init({
    rpcClient,
    networkId,
    logger: (...args) => log('[WALLET] ' + args.map((a) => (a == null ? '' : String(a))).join(' ')),
    onBalanceChange: (kasStr) => {
      balanceEvents++;
      log(`[EVENT] balance: ${kasStr} KAS`);
    },
  });

  const wallets = await walletService.getAllWallets();
  if (!Array.isArray(wallets)) {
    return fail('getAllWallets() did not return an array');
  }

  log(`Connected. Enumerated ${wallets.length} wallet descriptor(s).`);
  log(`Balance events observed during test: ${balanceEvents}`);

  return pass('connected + init ok + walletEnumerate ok');
}
