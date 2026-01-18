// Funding-gated integration test: fund wallet, estimate fee with payload, then send a small self-transaction.

import { getOrCreateSharedWallet, ensureSpendableOrPrompt } from './wallet_test_helpers.js';
import { sompiToKaspaString } from '../../kas-wasm/kaspa.js';

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}

function toBigInt(x) {
  return typeof x === 'bigint' ? x : BigInt(x);
}

export async function runTestFundingSendSelfPayload(logFn = null, ctx = null) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  log('[TEST] Funding-gated: estimate fee + send self tx with payload');

  const { walletService, address } = await getOrCreateSharedWallet({ ctx, discoverAddresses: false, storeMnemonic: false, logFn });

  // Ensure at least a tiny spendable amount before attempting estimates.
  await ensureSpendableOrPrompt({
    address,
    minSompi: 1n,
    getSpendableSompi: () => walletService.getSpendableBalance(),
    logFn,
  });

  // Pick a send amount in sompi.
  // NOTE: Very small outputs can legitimately fail under KIP-0009/Crescendo
  // with: "Storage mass exceeds maximum" depending on the wallet's available UTXO sizes.
  // Use a larger default (matches the stable "Generator" examples used elsewhere).
  let amountSompi = 20_000_000n; // 0.2 KAS
  const payload = 'wallet-tests:hello';

  // Ensure we have UTXOs and can estimate.
  let estimate;
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      estimate = await walletService.estimateTransactionFee({
        amount: sompiToKaspaString(amountSompi),
        toAddress: address,
        payload,
      });
      break;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      log(`[WARN] estimateTransactionFee failed (attempt ${attempt}/${maxAttempts}): ${msg}`);

      // If this is a storage-mass rejection, increasing the output value is often required.
      if (/storage mass exceeds maximum/i.test(msg)) {
        const bumped = 20_000_000n; // 0.2 KAS
        if (amountSompi < bumped) {
          amountSompi = bumped;
          log(`[INFO] Bumping amount to ${amountSompi.toString()} sompi to satisfy storage-mass constraints.`);
        } else {
          // Already using the bumped amount; the wallet likely needs different UTXOs (or more balance).
          log('[INFO] Storage-mass rejection persists; you may need to fund more or consolidate UTXOs.');
        }
      }

      // Common first-funding race: no UTXOs yet or immature.
      // Prompt for more spendable and retry.
      await ensureSpendableOrPrompt({
        address,
        minSompi: 100_000n,
        getSpendableSompi: () => walletService.getSpendableBalance(),
        logFn,
      });
    }
  }

  if (!estimate) {
    return fail('estimateTransactionFee never succeeded (see logs above)');
  }

  const feeSompi = toBigInt(estimate?.fees ?? 0n);
  const required = amountSompi + feeSompi;
  log(`[INFO] fee estimate: ${feeSompi.toString()} sompi | required (amount+fee): ${required.toString()} sompi`);

  await ensureSpendableOrPrompt({
    address,
    minSompi: required,
    getSpendableSompi: () => walletService.getSpendableBalance(),
    logFn,
  });

  const sendRes = await walletService.send({
    amount: sompiToKaspaString(amountSompi),
    toAddress: address,
    payload,
  });

  log('[OK] send() returned: ' + safeJsonStringify(sendRes));

  // Accept any non-null result object; SDK shapes vary.
  if (!sendRes) return fail('send() returned empty result');
  return pass('funding-gated send with payload succeeded');
}
