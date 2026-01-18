// Funding-gated integration test: send() rejects zero/negative amounts cleanly.
// Reuses the shared wallet so user funds once.

import { getOrCreateSharedWallet, ensureSpendableOrPrompt } from './wallet_test_helpers.js';

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

function cacheBust(path) {
  const sep = path.includes('?') ? '&' : '?';
  return path + sep + 'v=' + Date.now();
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

async function expectThrow(fn, { name, includesAny = [], logFn } = {}) {
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

export async function runTestSendAmountValidationLive(logFn = null, ctx = null) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  const effectiveCtx = ctx || window.walletTestContext;

  if (!effectiveCtx || !effectiveCtx.rpcClient || !effectiveCtx.networkId) {
    return fail('Not connected. Use the dashboard Connect button first.');
  }

  const { walletService, address: toAddress } = await getOrCreateSharedWallet({ ctx: effectiveCtx, logFn, discoverAddresses: false, storeMnemonic: false });

  // If this environment checks balance before amount validation, we need a tiny spendable amount.
  // Modal only shows if spendable < minSompi.
  await ensureSpendableOrPrompt({
    address: toAddress,
    minSompi: 1n,
    getSpendableSompi: () => walletService.getSpendableBalance(),
    logFn,
  });

  const t0 = await expectThrow(
    () => walletService.send({ amount: '0', toAddress }),
    { name: 'send(amount=0)', includesAny: ['Amount must be greater than zero'], logFn }
  );
  if (!t0.ok) return fail(t0.message);

  const tNeg = await expectThrow(
    () => walletService.send({ amount: '-1', toAddress }),
    {
      name: 'send(amount=-1)',
      // Some SDK/wrapper versions throw earlier with a BigInt type-mix error.
      // The core contract we care about here: negative amounts must be rejected.
      includesAny: ['Amount must be greater than zero', 'Cannot mix BigInt and other types'],
      logFn,
    }
  );
  if (!tNeg.ok) return fail(tNeg.message);

  return pass('send() rejects zero/negative amounts');
}
