// Safe validation test: ensure key wallet_service entrypoints reject calls before init().

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

async function expectThrow(fn, { includes = null, name = 'operation', logFn } = {}) {
  try {
    await fn();
    return { ok: false, message: `${name} did not throw` };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (typeof logFn === 'function') logFn(`[OK] ${name} threw: ${msg}`);
    if (includes && !msg.includes(includes)) {
      return { ok: false, message: `${name} threw, but message did not include "${includes}". Got: ${msg}` };
    }
    return { ok: true };
  }
}

export async function runTestInitGuards(logFn = null) {
  if (typeof logFn === 'function') {
    logFn('[TEST] init guards: calling wallet_service APIs before init()');
  }

  // Use a singleton import to avoid multiple WASM instances.
  // Reset internal state using closeWallet() if available.
  const walletService = await import('../../wrapper/wallet_service.js');
  if (typeof walletService.closeWallet === 'function') {
    try {
      await walletService.closeWallet();
    } catch {
      // ignore; closeWallet may throw if never initialized
    }
  }

  const checks = [];

  checks.push(await expectThrow(
    () => walletService.createWallet({ password: 'x' }),
    { includes: 'Wallet not initialized', name: 'createWallet()', logFn }
  ));

  checks.push(await expectThrow(
    () => walletService.send({ amount: '0.1', toAddress: 'kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' }),
    { includes: 'Wallet not initialized', name: 'send()', logFn }
  ));

  checks.push(await expectThrow(
    () => walletService.getAllWallets(),
    { includes: 'Wallet not initialized', name: 'getAllWallets()', logFn }
  ));

  // These currently do not have explicit guards; they should still throw when wallet is null.
  // This test treats “throws anything” as acceptable for now.
  checks.push(await expectThrow(
    () => walletService.getSpendableBalance(),
    { includes: null, name: 'getSpendableBalance()', logFn }
  ));

  checks.push(await expectThrow(
    () => walletService.generateNewAddress(false),
    { includes: null, name: 'generateNewAddress()', logFn }
  ));

  const firstFail = checks.find((c) => !c.ok);
  if (firstFail) return fail(firstFail.message);

  return pass('wallet_service APIs reject calls before init()');
}
