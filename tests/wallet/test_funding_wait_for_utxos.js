// Funding-gated integration test: prompt user to fund a fresh wallet and wait until spendable balance is detected.

import { awaitFunding } from './funding_modal.js';
import { getOrCreateSharedWallet, ensureSpendableOrPrompt } from './wallet_test_helpers.js';

function pass(msg) {
  return `PASS: ${msg}`;
}

function fail(msg) {
  return `FAIL: ${msg}`;
}

export async function runTestFundingWaitForUtxos(logFn = null, ctx = null) {
  const log = typeof logFn === 'function' ? logFn : () => {};
  log('[TEST] Funding-gated: wait for spendable UTXOs');

  const { walletService, address } = await getOrCreateSharedWallet({ ctx, discoverAddresses: false, storeMnemonic: false, logFn });

  // Wait for any spendable maturity. Start small; tests that need more will ask for more.
  const minSompi = 1n;

  await ensureSpendableOrPrompt({
    address,
    minSompi,
    getSpendableSompi: () => walletService.getSpendableBalance(),
    logFn,
  });

  const spendable = await walletService.getSpendableBalance();
  if (spendable < minSompi) return fail(`Spendable still below threshold: ${spendable.toString()}`);

  log(`[OK] Spendable sompi detected: ${spendable.toString()}`);
  return pass('funding gate works (detected spendable UTXOs)');
}
