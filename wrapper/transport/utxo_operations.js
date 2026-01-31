/**
 * High-level UTXO operations for rapid transactions.
 * Handles consolidation, splitting, and manual sends with janitor mode.
 *
 * IMPORTANT: SDK's createTransactions() handles change automatically via changeAddress.
 * We only pass the send output; SDK creates change outputs automatically.
 */

import * as txBuilder from "./tx_builder.js";
import * as utxoManager from "./utxo_manager.js";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DEFAULT_SMALL_THRESHOLD = 100000000n; // 1 KAS
const DEFAULT_MAX_SMALL_SWEEP = 5;
const DEFAULT_MAX_INPUTS_PER_TX = 80;
const MIN_OUTPUT_AMOUNT = 50000000n; // 0.5 KAS

// ─────────────────────────────────────────────────────────────
// Manual Send with Janitor Mode
// ─────────────────────────────────────────────────────────────

/**
 * Build and send a transaction with full UTXO control.
 * Supports janitor mode (dust sweeping as extra inputs).
 *
 * SDK handles change automatically via changeAddress parameter.
 * We only pass the send output - no manual change calculation needed.
 *
 * @param {Object} options
 * @param {Object} options.client - RPC client
 * @param {string} options.networkId - Network ID
 * @param {string} options.fromAddress - Source address
 * @param {string} options.toAddress - Destination address
 * @param {bigint} options.amountSompi - Amount to send in sompi
 * @param {string} [options.payload] - Optional payload
 * @param {Array} options.privateKeys - Private keys for signing
 * @param {bigint} [options.priorityFee=0n] - Priority fee
 * @param {number} [options.engineIndex] - Engine index for multi-engine
 * @param {number} [options.totalEngines] - Total engines
 * @param {Array} options.utxoEntries - Available UTXO entries
 * @param {boolean} [options.janitorMode=true] - Enable dust sweeping
 * @param {bigint} [options.smallThreshold] - Threshold for "small" UTXOs
 * @param {number} [options.maxSmallSweep=5] - Max small UTXOs to sweep
 * @returns {Promise<Object>} Transaction result
 */
export async function manualSend({
  client,
  networkId,
  fromAddress,
  toAddress,
  amountSompi,
  payload,
  privateKeys,
  priorityFee = 0n,
  engineIndex,
  totalEngines,
  utxoEntries,
  janitorMode = true,
  smallThreshold = DEFAULT_SMALL_THRESHOLD,
  maxSmallSweep = DEFAULT_MAX_SMALL_SWEEP,
} = {}) {
  if (!client) throw new Error("manualSend: client required.");
  if (!networkId) throw new Error("manualSend: networkId required.");
  if (!fromAddress) throw new Error("manualSend: fromAddress required.");
  if (!toAddress) throw new Error("manualSend: toAddress required.");
  if (amountSompi === undefined || amountSompi === null) {
    throw new Error("manualSend: amountSompi required.");
  }

  const allEntries = utxoEntries || [];
  const logPrefix = `[manualSend E${engineIndex ?? "?"}]`;
  const utxoCount = allEntries.length;

  if (utxoCount === 0) {
    throw new Error("No UTXOs available (all may be pending).");
  }

  // Categorize UTXOs
  const { smallUtxos, largeUtxos } = categorizeByThreshold(allEntries, smallThreshold);

  console.log(
    `${logPrefix} UTXOs: ${largeUtxos.length} large, ${smallUtxos.length} small, total=${utxoCount}`
  );

  // Select UTXOs based on mode
  const selection = selectUtxosForSend({
    largeUtxos,
    smallUtxos,
    amountSompi,
    engineIndex,
    totalEngines,
    janitorMode,
    maxSmallSweep,
    logPrefix,
  });

  const { selectedEntries, selectedTotal, isJanitorRun, consolidatedCount } = selection;

  // Calculate estimated fee for validation
  const payloadBytes = payload ? new TextEncoder().encode(payload).length : 0;
  const estimatedFee = txBuilder.estimateFee(selectedEntries.length, 2, payloadBytes) + priorityFee;

  // Validate we have enough funds (send amount + estimated fee)
  const requiredTotal = amountSompi + estimatedFee;
  if (selectedTotal < requiredTotal) {
    throw new Error(
      `Insufficient funds: have ${utxoManager.sompiToKas(selectedTotal)} KAS, ` +
      `need ${utxoManager.sompiToKas(requiredTotal)} KAS ` +
      `(send: ${utxoManager.sompiToKas(amountSompi)}, fee: ~${utxoManager.sompiToKas(estimatedFee)})`
    );
  }

  // ONLY pass the send output - SDK handles change automatically via changeAddress
  const outputs = [{ address: toAddress, amount: amountSompi }];

  console.log(
    `${logPrefix} Building tx: inputs=${selectedEntries.length}, ` +
    `total=${utxoManager.sompiToKas(selectedTotal)} KAS, ` +
    `sending=${utxoManager.sompiToKas(amountSompi)} KAS` +
    (isJanitorRun ? `, swept=${consolidatedCount} dust` : "")
  );

  // Build and submit transaction - SDK creates change output automatically
  const pendingTx = await txBuilder.buildPendingTransaction({
    entries: selectedEntries,
    outputs,
    changeAddress: fromAddress,
    networkId,
    payload,
    priorityFee,
  });

  const result = await txBuilder.submitPendingTransaction({
    pendingTx,
    privateKeys,
    client,
  });

  // Calculate actual change (input - send - estimated fee)
  const estimatedChange = selectedTotal - amountSompi - estimatedFee;

  return {
    transactionId: result.txid,
    submitRes: result.submitRes,
    inputCount: selectedEntries.length,
    outputCount: 2, // send + change (SDK creates change)
    totalInput: selectedTotal,
    totalOutput: amountSompi,
    estimatedFee,
    change: estimatedChange,
    usedEntries: selectedEntries,
    isJanitorRun,
    consolidatedCount,
    utxoCount,
  };
}

// ─────────────────────────────────────────────────────────────
// Consolidate UTXOs
// ─────────────────────────────────────────────────────────────

/**
 * Consolidate many UTXOs into fewer large ones.
 * Handles batching for large UTXO counts.
 *
 * @param {Object} options
 * @param {Object} options.client - RPC client
 * @param {string} options.networkId - Network ID
 * @param {string} options.address - Address for UTXOs
 * @param {Array} options.privateKeys - Private keys
 * @param {Array} options.entries - UTXO entries to consolidate
 * @param {number} [options.targetCount=5] - Target output count
 * @param {bigint} [options.priorityFee=0n] - Priority fee
 * @param {number} [options.maxInputsPerTx=80] - Max inputs per batch
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<Object>} Consolidation result
 */
export async function consolidateUtxos({
  client,
  networkId,
  address,
  privateKeys,
  entries,
  targetCount = 5,
  priorityFee = 0n,
  maxInputsPerTx = DEFAULT_MAX_INPUTS_PER_TX,
  onProgress,
} = {}) {
  if (!client) throw new Error("consolidateUtxos: client required.");
  if (!networkId) throw new Error("consolidateUtxos: networkId required.");
  if (!address) throw new Error("consolidateUtxos: address required.");
  if (!privateKeys?.length) throw new Error("consolidateUtxos: privateKeys required.");
  if (!entries?.length) throw new Error("No UTXOs available to consolidate.");

  if (targetCount < 1 || targetCount > 100) {
    throw new Error("consolidateUtxos: targetCount must be 1-100.");
  }

  const initialCount = entries.length;

  if (initialCount <= targetCount) {
    throw new Error(
      `Already have ${initialCount} UTXOs, which is <= target ${targetCount}. ` +
      `Use Split instead to increase UTXO count.`
    );
  }

  const txids = [];
  let totalConsolidated = 0;
  let round = 0;
  let currentMaxInputs = maxInputsPerTx;

  // Track spent UTXOs locally to avoid double-spending
  const spentInSession = new Set();

  const filterAvailable = (utxos) => {
    return utxos.filter((entry) => {
      const key = utxoManager.getEntryKey(entry);
      return key && !spentInSession.has(key);
    });
  };

  const estimatedRounds = Math.ceil(
    Math.log(entries.length / targetCount) / Math.log(currentMaxInputs)
  );

  console.log(
    `[consolidateUtxos] Starting: ${entries.length} UTXOs → ${targetCount} target, ` +
    `~${estimatedRounds} rounds estimated`
  );

  let availableEntries = filterAvailable(entries);

  while (availableEntries.length > targetCount) {
    round++;

    const inputCount = Math.min(availableEntries.length, currentMaxInputs);
    const remainingAfterBatch = availableEntries.length - inputCount + 1;
    const isLastRound = remainingAfterBatch <= targetCount;
    const outputCount = isLastRound ? targetCount : 1;

    // Sort smallest first for dust cleanup priority
    const sortedEntries = [...availableEntries].sort((a, b) => {
      const aa = utxoManager.entryAmountSompi(a);
      const bb = utxoManager.entryAmountSompi(b);
      return aa < bb ? -1 : aa > bb ? 1 : 0;
    });

    const batchEntries = sortedEntries.slice(0, inputCount);
    const batchTotal = utxoManager.calculateTotalBalance(batchEntries);
    const estimatedFee = txBuilder.estimateFee(inputCount, outputCount, 0) + priorityFee;
    const availableBalance = batchTotal - estimatedFee;

    if (availableBalance < MIN_OUTPUT_AMOUNT * BigInt(outputCount)) {
      console.warn(
        `[consolidateUtxos] Round ${round}: Insufficient funds after fees. ` +
        `Batch: ${utxoManager.sompiToKas(batchTotal)} KAS, Fee: ${utxoManager.sompiToKas(estimatedFee)} KAS`
      );
      // Mark these as spent to skip them
      for (const entry of batchEntries) {
        const key = utxoManager.getEntryKey(entry);
        if (key) spentInSession.add(key);
      }
      availableEntries = filterAvailable(entries);
      if (availableEntries.length === 0) break;
      continue;
    }

    const outputs = buildConsolidationOutputs(address, availableBalance, outputCount);

    console.log(
      `[consolidateUtxos] Round ${round}: Merging ${inputCount} → ${outputCount} output(s) ` +
      `(~${utxoManager.sompiToKas(availableBalance / BigInt(outputCount))} KAS each)`
    );

    try {
      const pendingTx = await txBuilder.buildPendingTransaction({
        entries: batchEntries,
        outputs,
        changeAddress: address,
        networkId,
        priorityFee,
      });

      const result = await txBuilder.submitPendingTransaction({
        pendingTx,
        privateKeys,
        client,
      });

      txids.push(result.txid);
      totalConsolidated += inputCount;

      // Mark batch as spent locally
      for (const entry of batchEntries) {
        const key = utxoManager.getEntryKey(entry);
        if (key) spentInSession.add(key);
      }

      console.log(`[consolidateUtxos] Round ${round} complete: txid=${result.txid?.slice(0, 16)}…`);

      if (typeof onProgress === "function") {
        onProgress({ round, estimatedRounds, txid: result.txid, inputCount, outputCount });
      }

      if (isLastRound) break;

      availableEntries = filterAvailable(entries);

      if (availableEntries.length === 0 || round > 50) {
        console.warn(`[consolidateUtxos] Stopping: no progress or too many rounds.`);
        break;
      }

    } catch (err) {
      console.error(`[consolidateUtxos] Round ${round} failed:`, err.message);

      // Reduce batch size on mass errors
      if (err.message?.includes("mass exceeds") && currentMaxInputs > 20) {
        currentMaxInputs = Math.floor(currentMaxInputs * 0.6);
        console.log(`[consolidateUtxos] Reducing batch size to ${currentMaxInputs}`);
        continue;
      }

      throw err;
    }
  }

  return {
    transactionId: txids[txids.length - 1],
    transactionIds: txids,
    rounds: round,
    inputCount: totalConsolidated,
    previousUtxoCount: initialCount,
    spentKeys: spentInSession,
  };
}

// ─────────────────────────────────────────────────────────────
// Split UTXOs
// ─────────────────────────────────────────────────────────────

/**
 * Split UTXOs into multiple equal outputs.
 *
 * @param {Object} options
 * @param {Object} options.client - RPC client
 * @param {string} options.networkId - Network ID
 * @param {string} options.address - Address for outputs
 * @param {Array} options.privateKeys - Private keys
 * @param {Array} options.entries - UTXO entries to split
 * @param {number} options.splitCount - Number of outputs
 * @param {bigint} [options.priorityFee=0n] - Priority fee
 * @returns {Promise<Object>} Split result
 */
export async function splitUtxos({
  client,
  networkId,
  address,
  privateKeys,
  entries,
  splitCount,
  priorityFee = 0n,
} = {}) {
  if (!client) throw new Error("splitUtxos: client required.");
  if (!networkId) throw new Error("splitUtxos: networkId required.");
  if (!address) throw new Error("splitUtxos: address required.");
  if (!privateKeys?.length) throw new Error("splitUtxos: privateKeys required.");
  if (!entries?.length) throw new Error("No UTXOs available to split.");
  if (!splitCount || splitCount < 2 || splitCount > 100) {
    throw new Error("splitUtxos: splitCount must be 2-100.");
  }

  const txDetails = await txBuilder.buildSplitUtxoTransaction({
    entries,
    address,
    splitCount,
    networkId,
    priorityFee,
  });

  const result = await txBuilder.submitPendingTransaction({
    pendingTx: txDetails.pendingTx,
    privateKeys,
    client,
  });

  return {
    transactionId: result.txid,
    submitRes: result.submitRes,
    splitCount,
    totalInput: txDetails.totalInput,
    splitAmount: txDetails.splitAmount,
    amountPerOutput: utxoManager.sompiToKas(txDetails.splitAmount),
    estimatedFee: txDetails.estimatedFee,
    outputCount: txDetails.outputCount,
    outputs: txDetails.outputs,
    previousUtxoCount: entries.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Private Helper Functions
// ─────────────────────────────────────────────────────────────

/**
 * Categorize UTXOs by threshold into small and large.
 */
function categorizeByThreshold(entries, threshold) {
  const smallUtxos = [];
  const largeUtxos = [];

  for (const entry of entries) {
    const amt = utxoManager.entryAmountSompi(entry);
    if (amt < threshold) {
      smallUtxos.push({ entry, amount: amt });
    } else {
      largeUtxos.push({ entry, amount: amt });
    }
  }

  // Sort both by amount descending
  largeUtxos.sort((a, b) => (a.amount > b.amount ? -1 : 1));
  smallUtxos.sort((a, b) => (a.amount > b.amount ? -1 : 1));

  return { smallUtxos, largeUtxos };
}

/**
 * Compute a stable slot for a UTXO based on its transaction ID.
 * This ensures the same UTXO always maps to the same engine,
 * even when the array order changes.
 * @param {Object} utxoWithEntry - { entry, amount } object
 * @param {number} totalEngines - Total number of engines
 * @returns {number} Engine slot (0 to totalEngines-1)
 */
function getUtxoSlot(utxoWithEntry, totalEngines) {
  const outpoint = utxoManager.getEntryOutpoint(utxoWithEntry.entry);
  if (!outpoint?.transactionId) return 0;

  // Simple hash: sum of char codes modulo totalEngines
  const txid = outpoint.transactionId;
  let hash = 0;
  for (let i = 0; i < txid.length; i++) {
    hash = (hash * 31 + txid.charCodeAt(i)) >>> 0; // Keep as unsigned 32-bit
  }
  // Include output index for uniqueness
  hash = (hash * 31 + (outpoint.index || 0)) >>> 0;

  return hash % totalEngines;
}

/**
 * Select UTXOs for a send operation.
 * Uses stable slot assignment based on UTXO transaction ID hash
 * to prevent collisions between parallel engines.
 */
function selectUtxosForSend({
  largeUtxos,
  smallUtxos,
  amountSompi,
  engineIndex,
  totalEngines,
  janitorMode,
  maxSmallSweep,
  logPrefix,
}) {
  const selectedEntries = [];
  let selectedTotal = 0n;
  let isJanitorRun = false;
  let consolidatedCount = 0;

  if (typeof engineIndex === "number" && typeof totalEngines === "number") {
    // ─────────────────────────────────────────────────────────────
    // Multi-engine mode: STABLE slot assignment by UTXO hash
    // Each UTXO is permanently assigned to an engine based on its txid hash.
    // This prevents collisions even when the UTXO array order changes.
    // ─────────────────────────────────────────────────────────────

    // Filter large UTXOs that belong to THIS engine's slot
    const myLargeUtxos = largeUtxos.filter(
      (u) => getUtxoSlot(u, totalEngines) === engineIndex
    );

    // Filter small UTXOs that belong to THIS engine's slot (Smart Janitor)
    const mySmallUtxos = janitorMode
      ? smallUtxos
          .filter((u) => getUtxoSlot(u, totalEngines) === engineIndex)
          .slice(0, maxSmallSweep)
      : [];

    const minRequired = amountSompi + 100000n; // Buffer for fees

    if (myLargeUtxos.length === 0) {
      throw new Error(
        `Engine ${engineIndex}: No large UTXO in my slot. ` +
        `Total large: ${largeUtxos.length}, need more UTXOs (try splitting).`
      );
    }

    // Pick the largest from my slot
    const primaryUtxo = myLargeUtxos.reduce((best, curr) =>
      curr.amount > best.amount ? curr : best
    );

    if (primaryUtxo.amount < minRequired) {
      throw new Error(
        `Engine ${engineIndex}: Primary UTXO too small. ` +
        `Need ${utxoManager.sompiToKas(minRequired)} KAS, ` +
        `have ${utxoManager.sompiToKas(primaryUtxo.amount)} KAS.`
      );
    }

    selectedEntries.push(primaryUtxo.entry);
    selectedTotal = primaryUtxo.amount;

    // Smart Janitor: Sweep only small UTXOs in MY slot
    if (mySmallUtxos.length > 0) {
      isJanitorRun = true;
      let smallTotal = 0n;

      for (const small of mySmallUtxos) {
        selectedEntries.push(small.entry);
        selectedTotal += small.amount;
        smallTotal += small.amount;
        consolidatedCount++;
      }

      console.log(
        `${logPrefix} 🧹 SMART JANITOR: Swept ${mySmallUtxos.length} dust in my slot ` +
        `(+${utxoManager.sompiToKas(smallTotal)} KAS)`
      );
    }

  } else {
    // ─────────────────────────────────────────────────────────────
    // Standard mode (single engine) - no sharding needed
    // ─────────────────────────────────────────────────────────────
    if (janitorMode && smallUtxos.length > 0 && largeUtxos.length > 0) {
      isJanitorRun = true;

      // Pick the largest UTXO
      const primaryUtxo = largeUtxos.reduce((best, curr) =>
        curr.amount > best.amount ? curr : best
      );
      selectedEntries.push(primaryUtxo.entry);
      selectedTotal = primaryUtxo.amount;

      const toSweep = smallUtxos.slice(0, maxSmallSweep);
      let smallTotal = 0n;

      for (const small of toSweep) {
        selectedEntries.push(small.entry);
        selectedTotal += small.amount;
        smallTotal += small.amount;
        consolidatedCount++;
      }

      console.log(
        `${logPrefix} 🧹 JANITOR: Sweeping ${toSweep.length} small UTXO(s) ` +
        `(${utxoManager.sompiToKas(smallTotal)} KAS)`
      );

    } else {
      // Use largest UTXO
      if (largeUtxos.length === 0) {
        throw new Error("No large UTXOs available.");
      }
      const primaryUtxo = largeUtxos.reduce((best, curr) =>
        curr.amount > best.amount ? curr : best
      );
      selectedEntries.push(primaryUtxo.entry);
      selectedTotal = primaryUtxo.amount;
    }
  }

  return { selectedEntries, selectedTotal, isJanitorRun, consolidatedCount };
}

/**
 * Build consolidation outputs.
 */
function buildConsolidationOutputs(address, availableBalance, outputCount) {
  const outputs = [];

  if (outputCount === 1) {
    outputs.push({ address: String(address), amount: availableBalance });
  } else {
    const splitAmount = availableBalance / BigInt(outputCount);
    const remainder = availableBalance % BigInt(outputCount);

    for (let i = 0; i < outputCount; i++) {
      outputs.push({
        address: String(address),
        amount: i === 0 ? splitAmount + remainder : splitAmount,
      });
    }
  }

  return outputs;
}
