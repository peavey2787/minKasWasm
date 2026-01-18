// Live integration test: call estimateTransactionFee() (WASM Generator), validate results,
// then actually send using the estimate so we are not guessing.

import { getOrCreateSharedWallet, ensureSpendableOrPrompt } from './wallet_test_helpers.js';
import { sompiToKaspaString, kaspaToSompi } from '../../kas-wasm/kaspa.js';

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

function asBigInt(v) {
  try {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number') return BigInt(v);
    if (typeof v === 'string' && v.trim() !== '') return BigInt(v);
  } catch {
    // ignore
  }
  return null;
}

function extractTxId(sendRes) {
  if (!sendRes) return null;

  const direct = sendRes.transactionId || sendRes.txid || sendRes.txId || sendRes.finalTransactionId || sendRes.id;
  if (typeof direct === 'string' && direct.length > 10) return direct;

  const arr = sendRes.transactionIds || sendRes.txIds || sendRes.ids;
  if (Array.isArray(arr) && typeof arr[0] === 'string') return arr[0];

  const nested = sendRes?.summary?.finalTransactionId || sendRes?.summary?.transactionId;
  if (typeof nested === 'string' && nested.length > 10) return nested;

  return null;
}

function isStorageMassError(err) {
  const msg = err && err.message ? err.message : String(err);
  return /storage mass exceeds maximum/i.test(msg);
}

function asciiPayloadBytes(n) {
  if (n <= 0) return '';
  return 'a'.repeat(n);
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

export async function runTestEstimateFeeLive(logFn = null, ctx = null) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  log('[TEST] Live: estimateTransactionFee() from WASM Generator + funded send');

  const { walletService, address, ctx: effectiveCtx } = await getOrCreateSharedWallet({ ctx, discoverAddresses: false, storeMnemonic: false, logFn });

  // Use an amount aligned with the official Generator example.
  // With Crescendo/KIP-0009 storage-mass rules, very small outputs can be rejected depending on
  // the input UTXO values available in the wallet (even if above dust).
  const amountKas = '0.2';
  const amountSompi = kaspaToSompi(amountKas);

  // Ensure we have at least some spendable before estimating.
  await ensureSpendableOrPrompt({
    address,
    minSompi: 1n,
    getSpendableSompi: () => walletService.getSpendableBalance(),
    logFn,
  });

  let estimateNoPayload;
  try {
    estimateNoPayload = await walletService.estimateTransactionFee({
      amount: amountKas,
      toAddress: address,
    });
  } catch (err) {
    if (isStorageMassError(err)) {
      // Log balance to help diagnose if the issue is fragmented/tiny UTXOs
      let balance = 'unknown';
      try {
        const sompi = await walletService.getSpendableBalance();
        balance = sompi != null ? sompi.toString() + ' sompi' : 'unknown';
      } catch { /* ignore */ }
      return fail(
        `estimateTransactionFee(no payload) failed with "Storage mass exceeds maximum". ` +
          `Balance: ${balance}. This may indicate tiny/fragmented UTXOs or a Generator issue.`
      );
    }
    const msg = err && err.message ? err.message : String(err);
    return fail('estimateTransactionFee(no payload) threw: ' + msg);
  }

  // If wrapper returns utxos, report them for visibility (no direct RPC calls from tests).
  if (Array.isArray(estimateNoPayload?.utxos)) {
    log(`[INFO] estimate(no payload) utxos.length=${estimateNoPayload.utxos.length}`);
  }

  // Small payload should still succeed; if it fails with storage-mass, something is wrong.
  const smallPayload = 'wallet-tests:hello';
  let estimateSmallPayload;
  try {
    estimateSmallPayload = await walletService.estimateTransactionFee({
      amount: amountKas,
      toAddress: address,
      payload: smallPayload,
    });
  } catch (err) {
    if (isStorageMassError(err)) {
      return fail(
        'estimateTransactionFee(small payload) failed with "Storage mass exceeds maximum". ' +
          'A tiny payload should not exceed max mass; this suggests a settings/payload encoding issue.'
      );
    }
    const msg = err && err.message ? err.message : String(err);
    return fail('estimateTransactionFee(small payload) threw: ' + msg);
  }

  if (Array.isArray(estimateSmallPayload?.utxos)) {
    log(`[INFO] estimate(small payload) utxos.length=${estimateSmallPayload.utxos.length}`);
  }

  // Large payload boundary check: storage-mass rejection is expected behavior.
  // Use 32KB (wrapper send() limit) to confirm the generator enforces mass limits.
  const largePayload = asciiPayloadBytes(32 * 1024);
  try {
    const estimateLargePayload = await walletService.estimateTransactionFee({
      amount: amountKas,
      toAddress: address,
      payload: largePayload,
    });
    const massL = asBigInt(estimateLargePayload?.mass);
    const feesL = asBigInt(estimateLargePayload?.fees);
    log(
      `[INFO] large payload (32KB) estimate succeeded: mass=${massL == null ? '?' : massL.toString()} fees=${feesL == null ? '?' : feesL.toString()} sompi (${estimateLargePayload?.feesKas || ''} KAS)`
    );
  } catch (err) {
    if (isStorageMassError(err)) {
      log('[OK] large payload (32KB) rejected by mass limit: ' + (err && err.message ? err.message : String(err)));
    } else {
      const msg = err && err.message ? err.message : String(err);
      return fail('estimateTransactionFee(large payload) threw unexpected error: ' + msg);
    }
  }

  const fees0 = asBigInt(estimateNoPayload?.fees);
  const fees1 = asBigInt(estimateSmallPayload?.fees);
  const mass0 = asBigInt(estimateNoPayload?.mass);
  const mass1 = asBigInt(estimateSmallPayload?.mass);
  // Note: large payload may legitimately fail due to mass limits.

  if (fees0 == null || fees1 == null || mass0 == null || mass1 == null) {
    log('[DEBUG] estimateNoPayload: ' + safeJsonStringify(estimateNoPayload));
    log('[DEBUG] estimateSmallPayload: ' + safeJsonStringify(estimateSmallPayload));
    return fail('estimateTransactionFee did not return {mass, fees} as BigInt-like values');
  }

  log(`[INFO] no payload: mass=${mass0.toString()} fees=${fees0.toString()} sompi (${estimateNoPayload?.feesKas || ''} KAS)`);
  log(`[INFO] small payload: mass=${mass1.toString()} fees=${fees1.toString()} sompi (${estimateSmallPayload?.feesKas || ''} KAS)`);
  if (fees0 <= 0n || mass0 <= 0n) return fail('estimateTransactionFee returned non-positive mass/fees');

  // Payload should not reduce mass/fees.
  if (mass1 < mass0 || fees1 < fees0) return fail('Payload caused estimate to decrease (unexpected)');

  // Often (but not always) payload increases mass/fees; warn only.
  const strictIncrease = mass1 > mass0 || fees1 > fees0;
  if (!strictIncrease) log('[WARN] Small payload did not increase mass/fees; this can happen due to rounding.');

  // Priority fee consistency: totalFees = baseFee + priorityFee
  let estimateWithPriority;
  try {
    estimateWithPriority = await walletService.estimateTransactionFee({
      amount: amountKas,
      toAddress: address,
      payload: 'wallet-tests:prio',
      priorityFeeKas: '0.00001',
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return fail('estimateTransactionFee with priorityFeeKas threw: ' + msg);
  }

  const totalFeesP = asBigInt(estimateWithPriority?.fees);
  const baseFeeP = asBigInt(estimateWithPriority?.baseFee);
  const prioP = asBigInt(estimateWithPriority?.priorityFee);
  if (totalFeesP == null || baseFeeP == null || prioP == null) {
    return fail('estimateTransactionFee did not return fees/baseFee/priorityFee as BigInt-like values');
  }
  if (baseFeeP + prioP !== totalFeesP) {
    return fail('estimateTransactionFee invariant failed: baseFee + priorityFee != fees');
  }

  // Now actually send using the small-payload estimate; require exactly amount + estimated fee.
  const required = amountSompi + fees1;
  log(`[INFO] Funding requirement for send: amount(${amountSompi}) + estFees(${fees1}) = ${required.toString()} sompi`);

  await ensureSpendableOrPrompt({
    address,
    minSompi: required,
    getSpendableSompi: () => walletService.getSpendableBalance(),
    logFn,
  });

  let sendRes;
  try {
    sendRes = await walletService.send({
      amount: sompiToKaspaString(amountSompi),
      toAddress: address,
      payload: 'wallet-tests:hello',
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return fail('send() failed even after funding with estimate: ' + msg);
  }

  log('[OK] send() returned: ' + safeJsonStringify(sendRes));
  const txid = extractTxId(sendRes);
  if (txid) log('[INFO] txid: ' + txid);

  return pass('estimateTransactionFee produced sane/monotonic estimates and funded send succeeded');
}
