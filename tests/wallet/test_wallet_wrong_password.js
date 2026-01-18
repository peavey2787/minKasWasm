// Safe integration test: wrong password should not silently create/overwrite a wallet.

import { createEphemeralWallet } from './wallet_test_helpers.js';

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

async function expectThrow(fn, { name, logFn } = {}) {
  try {
    await fn();
    return { ok: false, message: `${name} did not throw` };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (typeof logFn === 'function') logFn(`[OK] ${name} threw: ${msg}`);
    return { ok: true };
  }
}

export async function runTestWalletWrongPassword(logFn = null, ctx = null) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  log('[TEST] wallet wrong password handling');

  const { walletService, filename, ctx: effectiveCtx } = await createEphemeralWallet({ ctx, password: 'correct-password', discoverAddresses: false, storeMnemonic: false, logFn });

  // IMPORTANT:
  // If wallet_service keeps the wallet open/started in-memory, a second createWallet()
  // call may skip walletOpen() and therefore will not validate the password.
  // Force a fresh open attempt here.
  let ws = walletService;
  if (typeof ws.closeWallet === 'function') {
    try {
      await ws.closeWallet();
      // Re-init after close so the next createWallet() must call walletOpen again.
      ws.init({
        rpcClient: effectiveCtx.rpcClient,
        networkId: effectiveCtx.networkId,
        logger: (...args) => log('[WALLET] ' + args.map((a) => (a == null ? '' : String(a))).join(' ')),
        onBalanceChange: (kasStr) => log(`[EVENT] balance: ${kasStr} KAS`),
      });
    } catch (e) {
      return fail('closeWallet() failed; cannot safely re-import wallet_service in tests without risking multiple WASM instances. Error: ' + (e && e.message ? e.message : String(e)));
    }
  } else {
    return fail('closeWallet() not available; cannot force password revalidation safely without re-importing wallet_service.');
  }

  // Attempt to open the same wallet with a wrong password.
  // Current wallet_service implementation will try walletOpen() then fall back to _createNewWallet().
  // For an existing wallet, _createNewWallet() will suppress "Wallet already exists" and then walletOpen() should fail.
  const t = await expectThrow(
    () => ws.createWallet({
      password: 'wrong-password',
      filename,
      storeMnemonic: false,
      discoverAddresses: false,
    }),
    { name: 'createWallet(wrong password)', logFn }
  );

  if (!t.ok) return fail(t.message);
  return pass('wrong password does not succeed');
}
