import { connect } from "./kaspa_client.js";
import * as txBuilder from "./tx_builder.js";
import * as utxoManager from "./utxo_manager.js";
import { runRpcCommand } from "./rpc_runner.js";

export class TransportFacade {
  constructor() {
    this.client = null;
    this.networkId = null;

    // UTXO cache for rapid transactions
    this._utxoCache = new Map(); // address -> { entries, timestamp }
    this._utxoCacheTtlMs = 500; // Cache TTL in ms

    // Spent UTXO tracking for optimistic updates
    this._spentUtxos = new Set(); // Set of "txid:index" keys
  }

  /**
   * Connect to a Kaspa node.
   * @param {Object} [options] - Connection options
   * @param {string} [options.rpcUrl] - WebSocket URL or null for public resolver
   * @param {string} [options.networkId="testnet-10"] - Network ID
   * @param {function} [options.onDisconnect] - Callback for disconnection
   */
  async connect(options = {}) {
    // Handle null/undefined options gracefully
    const opts = options || {};
    const { rpcUrl, networkId = "testnet-10", onDisconnect } = opts;
    // kaspa_client.connect expects an object, not positional args
    this.client = await connect({ rpcUrl, networkId, onDisconnect });
    this.networkId = networkId;
    return this.client;
  }

  /**
   * Disconnect from the node.
   */
  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this._utxoCache.clear();
    this._spentUtxos.clear();
  }

  get isConnected() {
    return !!(this.client && this.client.isConnected);
  }

  // ─────────────────────────────────────────────────────────────
  // UTXO Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Fetch UTXOs for a given account descriptor (receive/change addresses).
   * @param {Object} accountDescriptor - { receiveAddress, changeAddress }
   */
  async getAccountUtxos(accountDescriptor) {
    this._checkConnected();
    return utxoManager.getAccountUtxos({
      wallet: { rpc: this.client },
      accountDescriptor,
    });
  }

  /**
   * Fetch UTXOs for a single address directly via RPC.
   * @param {string} address - Kaspa address
   * @param {Object} [options] - Options
   * @param {boolean} [options.useCache=false] - Use cached UTXOs if available
   * @param {boolean} [options.excludeSpent=true] - Exclude optimistically spent UTXOs
   * @returns {Promise<Array>} Array of UTXO entries
   */
  async getUtxos(address, { useCache = false, excludeSpent = true } = {}) {
    this._checkConnected();

    // Check cache
    if (useCache) {
      const cached = this._utxoCache.get(address);
      if (cached && Date.now() - cached.timestamp < this._utxoCacheTtlMs) {
        let entries = cached.entries;
        if (excludeSpent) {
          entries = this._filterSpentUtxos(entries);
        }
        return entries;
      }
    }

    // Fetch fresh UTXOs
    const entries = await utxoManager.getUtxosByAddress(this.client, address);

    // Update cache
    this._utxoCache.set(address, { entries, timestamp: Date.now() });

    // Filter spent UTXOs
    if (excludeSpent) {
      return this._filterSpentUtxos(entries);
    }

    return entries;
  }

  /**
   * Filter out spent UTXOs from entries.
   * @private
   */
  _filterSpentUtxos(entries) {
    return entries.filter((e) => {
      const key = utxoManager.getEntryKey(e);
      return !this._spentUtxos.has(key);
    });
  }

  /**
   * Mark UTXOs as spent (optimistic update).
   * @param {Array} entries - UTXO entries that were spent
   */
  markUtxosAsSpent(entries) {
    for (const e of entries || []) {
      const key = utxoManager.getEntryKey(e);
      this._spentUtxos.add(key);
    }
  }

  /**
   * Clear spent UTXO tracking.
   * @param {Array} [entries] - Specific entries to clear, or all if not provided
   */
  clearSpentUtxos(entries) {
    if (entries) {
      for (const e of entries) {
        const key = utxoManager.getEntryKey(e);
        this._spentUtxos.delete(key);
      }
    } else {
      this._spentUtxos.clear();
    }
  }

  /**
   * Invalidate UTXO cache for an address.
   * @param {string} [address] - Address to invalidate, or all if not provided
   */
  invalidateUtxoCache(address) {
    if (address) {
      this._utxoCache.delete(address);
    } else {
      this._utxoCache.clear();
    }
  }

  /**
   * Select UTXOs for a transaction (Largest First strategy).
   * @param {Array} entries - Array of UTXO entries.
   * @param {Object} options - { targetSompi, maxInputs }
   */
  selectUtxosLargestFirst(entries, options) {
    return utxoManager.selectUtxosLargestFirst(entries, options);
  }

  /**
   * Select a UTXO for a specific engine in multi-engine mode.
   * @param {Array} entries - Array of UTXO entries
   * @param {number} engineIndex - Engine index (0-based)
   * @param {number} totalEngines - Total number of engines
   * @param {bigint} [minAmount=0n] - Minimum UTXO amount
   */
  selectUtxoForEngine(entries, engineIndex, totalEngines, minAmount) {
    return utxoManager.selectUtxoForEngine(entries, engineIndex, totalEngines, minAmount);
  }

  /**
   * Calculate total balance from UTXO entries.
   * @param {Array} entries - UTXO entries
   * @returns {bigint} Total in sompi
   */
  calculateTotalBalance(entries) {
    return utxoManager.calculateTotalBalance(entries);
  }

  /**
   * Categorize UTXOs by size.
   * @param {Array} entries - UTXO entries
   * @returns {{ dust: Array, small: Array, medium: Array, large: Array }}
   */
  categorizeUtxos(entries) {
    return utxoManager.categorizeUtxos(entries);
  }

  /**
   * Get UTXO entry amount in sompi.
   * @param {Object} entry - UTXO entry
   * @returns {bigint}
   */
  getEntryAmount(entry) {
    return utxoManager.entryAmountSompi(entry);
  }

  // ─────────────────────────────────────────────────────────────
  // Transaction Building & Submission
  // ─────────────────────────────────────────────────────────────

  /**
   * Estimate transaction mass and fees.
   */
  async estimateTransaction(args) {
    return txBuilder.estimateTransaction(args);
  }

  /**
   * Estimate fee for a transaction based on input/output counts.
   * @param {number} inputCount - Number of inputs
   * @param {number} outputCount - Number of outputs
   * @param {number} [payloadBytes=0] - Payload size in bytes
   * @returns {bigint} Estimated fee in sompi
   */
  estimateFee(inputCount, outputCount, payloadBytes = 0) {
    return txBuilder.estimateFee(inputCount, outputCount, payloadBytes);
  }

  /**
   * Build a pending transaction (without signing).
   */
  async buildPendingTransaction(args) {
    return txBuilder.buildPendingTransaction(args);
  }

  /**
   * Build a transaction with explicit change handling.
   *
   * @param {Object} options
   * @param {Array} options.entries - UTXO entries to spend
   * @param {Array} options.outputs - Output specifications [{ address, amount }]
   * @param {string} options.changeAddress - Address for change output
   * @param {string} [options.payload] - Optional payload string
   * @param {bigint} [options.priorityFee=0n] - Priority fee in sompi
   * @param {boolean} [options.autoChange=true] - Automatically add change output
   * @returns {Promise<Object>} Transaction details
   */
  async buildManualTransaction(options) {
    this._checkConnected();
    return txBuilder.buildManualTransaction({
      ...options,
      networkId: this.networkId,
    });
  }

  /**
   * Build a UTXO split transaction.
   * Consolidates all inputs and splits into N equal outputs.
   *
   * @param {Object} options
   * @param {Array} options.entries - UTXO entries to consolidate
   * @param {string} options.address - Address for all outputs
   * @param {number} options.splitCount - Number of outputs (2-100)
   * @param {bigint} [options.priorityFee=0n] - Priority fee
   * @returns {Promise<Object>} Split transaction details
   */
  async buildSplitUtxoTransaction(options) {
    this._checkConnected();
    return txBuilder.buildSplitUtxoTransaction({
      ...options,
      networkId: this.networkId,
    });
  }

  /**
   * Sign a pending transaction with private keys.
   */
  async signPendingTransaction(pendingTx, privateKeys) {
    return txBuilder.signPendingTransaction(pendingTx, privateKeys);
  }

  /**
   * Submit a pending transaction. Signs it first if privateKeys are provided.
   * @param {Object} pendingTx - The pending transaction object.
   * @param {Array} [privateKeys] - Array of private keys (hex or objects).
   */
  async submitPendingTransaction(pendingTx, privateKeys = []) {
    this._checkConnected();
    return txBuilder.submitPendingTransaction({
      pendingTx,
      privateKeys,
      client: this.client,
    });
  }

  /**
   * Build, sign, and submit a transaction in one go.
   */
  async buildSignSubmitTransaction(args) {
    this._checkConnected();
    return txBuilder.buildSignSubmitTransaction({
      ...args,
      client: this.client,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Manual Send - Full Control Over Transaction Building
  // ─────────────────────────────────────────────────────────────

  /**
   * Manually build and send a transaction with full control.
   *
   * This method gives you complete control over UTXO selection, output
   * creation, and change handling. Designed for rapid-fire transactions
   * where you want to avoid UTXO refresh delays.
   *
   * @param {Object} options
   * @param {string} options.fromAddress - Source address for UTXO lookup
   * @param {string} options.toAddress - Destination address
   * @param {string|bigint} options.amount - Amount to send (KAS string or sompi bigint)
   * @param {string} [options.payload] - Optional payload
   * @param {Array} [options.privateKeys] - Private keys for signing
   * @param {bigint} [options.priorityFee=0n] - Priority fee in sompi
   * @param {number} [options.engineIndex] - Engine index for multi-engine mode
   * @param {number} [options.totalEngines] - Total engines for multi-engine mode
   * @param {boolean} [options.optimisticSpend=true] - Track spent UTXOs optimistically
   * @returns {Promise<Object>} Transaction result
   */
  async manualSend({
    fromAddress,
    toAddress,
    amount,
    payload,
    privateKeys,
    priorityFee = 0n,
    engineIndex,
    totalEngines,
    optimisticSpend = true,
  } = {}) {
    this._checkConnected();

    if (!fromAddress) throw new Error("manualSend: fromAddress required.");
    if (!toAddress) throw new Error("manualSend: toAddress required.");
    if (amount === undefined || amount === null) throw new Error("manualSend: amount required.");

    // Convert amount to sompi if needed
    const amountSompi = typeof amount === "bigint"
      ? amount
      : utxoManager.kasToSompi(amount);

    // Fetch UTXOs (excluding already-spent ones)
    const allEntries = await this.getUtxos(fromAddress, {
      useCache: true,
      excludeSpent: optimisticSpend,
    });

    console.log(`[manualSend E${engineIndex ?? "?"}] UTXOs found: ${allEntries.length}, spent set size: ${this._spentUtxos.size}`);
    if (allEntries.length > 0 && allEntries.length <= 10) {
      allEntries.forEach((e, i) => {
        const amt = utxoManager.entryAmountSompi(e);
        const key = utxoManager.getEntryKey(e);
        console.log(`  UTXO[${i}]: ${amt} sompi, key=${key?.slice(0,16)}...`);
      });
    }

    if (allEntries.length === 0) {
      throw new Error("No UTXOs available (all may be pending).");
    }

    // Select UTXO(s) based on engine mode or standard selection
    let selectedEntries;
    let selectedTotal;

    if (typeof engineIndex === "number" && typeof totalEngines === "number") {
      // Multi-engine mode: select one UTXO assigned to this engine
      const minRequired = amountSompi + 100000n; // Add buffer for fees
      console.log(`[manualSend E${engineIndex}] minRequired=${minRequired}, amountSompi=${amountSompi}`);

      const { entry, amount: entryAmount } = this.selectUtxoForEngine(
        allEntries,
        engineIndex,
        totalEngines,
        minRequired,
      );

      console.log(`[manualSend E${engineIndex}] Selected entry: amount=${entryAmount}, entry=${entry ? "found" : "null"}`);

      if (!entry) {
        // Provide more context on why no UTXO was found
        const totalAvailable = this.calculateTotalBalance(allEntries);
        throw new Error(
          `Engine ${engineIndex}: No suitable UTXO. ` +
          `Need ${minRequired} sompi, have ${allEntries.length} UTXOs totaling ${totalAvailable} sompi. ` +
          `UTXOs may be too small or all assigned to other engines.`
        );
      }

      selectedEntries = [entry];
      selectedTotal = entryAmount;
    } else {
      // Standard mode: largest-first selection
      const estimatedFee = this.estimateFee(1, 2, payload?.length || 0);
      const targetSompi = amountSompi + estimatedFee + priorityFee;

      const { selected, total } = this.selectUtxosLargestFirst(allEntries, {
        targetSompi,
        maxInputs: 10,
      });

      if (total < targetSompi) {
        throw new Error(
          `Insufficient funds: need ${targetSompi}, have ${total}`
        );
      }

      selectedEntries = selected;
      selectedTotal = total;
    }

    // Build outputs
    const outputs = [{ address: toAddress, amount: amountSompi }];

    console.log(`[manualSend E${engineIndex ?? "?"}] Building tx: entries=${selectedEntries.length}, selectedTotal=${selectedTotal}, outputAmount=${amountSompi}`);

    // Build transaction with automatic change handling
    const txDetails = await this.buildManualTransaction({
      entries: selectedEntries,
      outputs,
      changeAddress: fromAddress,
      payload,
      priorityFee,
      autoChange: true,
    });

    // Mark UTXOs as spent optimistically
    if (optimisticSpend) {
      this.markUtxosAsSpent(selectedEntries);
    }

    // Sign and submit
    const result = await this.submitPendingTransaction(
      txDetails.pendingTx,
      privateKeys,
    );

    return {
      transactionId: result.txid,
      submitRes: result.submitRes,
      inputCount: txDetails.inputCount,
      outputCount: txDetails.outputCount,
      totalInput: txDetails.totalInput,
      totalOutput: txDetails.totalOutput,
      estimatedFee: txDetails.estimatedFee,
      change: txDetails.change,
      usedEntries: selectedEntries,
    };
  }

  /**
   * Split UTXOs into multiple equal outputs for parallel transactions.
   *
   * @param {Object} options
   * @param {string} options.address - Address for UTXO lookup and outputs
   * @param {number} options.splitCount - Number of outputs (2-100)
   * @param {Array} options.privateKeys - Private keys for signing
   * @param {bigint} [options.priorityFee=0n] - Priority fee
   * @returns {Promise<Object>} Split result with txid and output details
   */
  async splitUtxos({
    address,
    splitCount,
    privateKeys,
    priorityFee = 0n,
  } = {}) {
    this._checkConnected();

    if (!address) throw new Error("splitUtxos: address required.");
    if (!splitCount || splitCount < 2 || splitCount > 100) {
      throw new Error("splitUtxos: splitCount must be 2-100.");
    }
    if (!privateKeys || privateKeys.length === 0) {
      throw new Error("splitUtxos: privateKeys required.");
    }

    // Clear spent tracking before fetching
    this.clearSpentUtxos();
    this.invalidateUtxoCache(address);

    // Fetch all UTXOs
    const entries = await this.getUtxos(address, {
      useCache: false,
      excludeSpent: false,
    });

    if (entries.length === 0) {
      throw new Error("No UTXOs available to split.");
    }

    // Build split transaction
    const txDetails = await this.buildSplitUtxoTransaction({
      entries,
      address,
      splitCount,
      priorityFee,
    });

    // Sign and submit
    const result = await this.submitPendingTransaction(
      txDetails.pendingTx,
      privateKeys,
    );

    // Clear caches after split
    this.clearSpentUtxos();
    this.invalidateUtxoCache(address);

    // Convert splitAmount to KAS for display
    const splitAmountKas = utxoManager.sompiToKas(txDetails.splitAmount);

    return {
      transactionId: result.txid,
      submitRes: result.submitRes,
      splitCount,
      totalInput: txDetails.totalInput,
      splitAmount: txDetails.splitAmount,
      amountPerOutput: splitAmountKas,
      estimatedFee: txDetails.estimatedFee,
      outputCount: txDetails.outputCount,
      outputs: txDetails.outputs,
      previousUtxoCount: entries.length,
    };
  }

  /**
   * Get UTXO analysis for an address.
   * @param {string} address - Address to analyze
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeUtxos(address) {
    this._checkConnected();

    const entries = await this.getUtxos(address, {
      useCache: false,
      excludeSpent: false,
    });

    const categories = this.categorizeUtxos(entries);
    const totalBalance = this.calculateTotalBalance(entries);
    const pendingSpent = this._spentUtxos.size;

    // Calculate amounts by category
    const dustTotal = this.calculateTotalBalance(categories.dust);
    const smallTotal = this.calculateTotalBalance(categories.small);
    const mediumTotal = this.calculateTotalBalance(categories.medium);
    const largeTotal = this.calculateTotalBalance(categories.large);

    return {
      address,
      totalBalance,
      totalBalanceKas: utxoManager.sompiToKas(totalBalance),
      utxoCount: entries.length,
      pendingSpent,
      categories: {
        dust: { count: categories.dust.length, total: dustTotal },
        small: { count: categories.small.length, total: smallTotal },
        medium: { count: categories.medium.length, total: mediumTotal },
        large: { count: categories.large.length, total: largeTotal },
      },
      entries,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // RPC
  // ─────────────────────────────────────────────────────────────

  /**
   * Run a raw JSON-RPC command.
   * @param {string} cmdText - JSON string { method, params }.
   */
  async runRpcCommand(cmdText) {
    return runRpcCommand(this.client, cmdText);
  }

  _checkConnected() {
    if (!this.client)
      throw new Error("TransportFacade: Not connected to Kaspa node.");
  }
}
