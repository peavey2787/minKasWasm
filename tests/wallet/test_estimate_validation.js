// Safe validation test: wallet_service.estimateTransactionFee input checks fire before any wallet/network usage.

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

async function expectThrow(fn, { name, includesAny = [] , logFn } = {}) {
  try {
    await fn();
    return { ok: false, message: `${name} did not throw` };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    if (typeof logFn === 'function') logFn(`[OK] ${name} threw: ${msg}`);
    if (includesAny.length) {
      const ok = includesAny.some((s) => msg.includes(s));
      if (!ok) {
        return { ok: false, message: `${name} message mismatch. Expected one of: ${includesAny.join(' | ')}. Got: ${msg}` };
      }
    }
    return { ok: true };
  }
}

export async function runTestEstimateValidation(logFn = null) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  log('[TEST] estimateTransactionFee validation');

  const walletService = await import('../../wrapper/wallet_service.js');
  if (typeof walletService.closeWallet === 'function') {
    try {
      await walletService.closeWallet();
    } catch {
      // ignore
    }
  }

  const t1 = await expectThrow(
    () => walletService.estimateTransactionFee({ amount: '1', toAddress: '' }),
    { name: 'estimateTransactionFee(empty toAddress)', includesAny: ['Invalid address'], logFn }
  );
  if (!t1.ok) return fail(t1.message);

  const t2 = await expectThrow(
    () => walletService.estimateTransactionFee({ amount: null, toAddress: 'x' }),
    { name: 'estimateTransactionFee(null amount)', includesAny: ['null', 'Amount'], logFn }
  );
  if (!t2.ok) return fail(t2.message);

  const t3 = await expectThrow(
    () => walletService.estimateTransactionFee({ amount: 'not-a-number', toAddress: 'x' }),
    { name: 'estimateTransactionFee(non-numeric amount)', includesAny: ['not-a-number', 'Amount'], logFn }
  );
  if (!t3.ok) return fail(t3.message);

  return pass('estimateTransactionFee rejects invalid address/amount');
}
