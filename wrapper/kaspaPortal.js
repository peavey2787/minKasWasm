import { TransportFacade } from "./transport/transportFacade.js";
import { IdentityFacade } from "./identity/identityFacade.js";
import {
  IntelligenceFacade,
  IndexerEventType,
  MatchMode,
  EvictionReason,
  IndexerStore,
  SearchMode,
} from "./intelligence/intelligenceFacade.js";
import { CryptoFacade } from "./crypto/cryptoFacade.js";
import { VRFFacade } from "./vrf/vrfFacade.js";
import initKaspa from "./kas-wasm/kaspa.js";
import { SessionManager } from "../kktp/sessionFacade.js";

let wasmInitialized = false;

// Re-export common enums for convenience
export {
  SearchMode,
  IndexerEventType,
  MatchMode,
  EvictionReason,
  IndexerStore,
};

/**
 * KaspaPortal: The Master Facade.
 * Provides a single entry point for Transport, Identity, Intelligence, and Crypto services.
 */
export class KaspaPortal {
  /**
   * @param {Object} [options] - Configuration options.
   * @param {Object} [options.intelligence] - Options for IntelligenceFacade { scanner: {}, indexer: {} }.
   */
  constructor() {
    this._isReady = false;
    this._connectedPromise = null;

    // Initialize sub-facades
    this.transport = new TransportFacade();
    this.identity = new IdentityFacade();
    this.crypto = new CryptoFacade();
    this.vrf = new VRFFacade(false);
    // Initialized on connect()
    this.intelligence = null;
    this.sessionManager = new SessionManager(this);
  }

  async init() {
    // Initialize Kaspa wasm sdk once
    if (!wasmInitialized) {
      await initKaspa();
      wasmInitialized = true;
    }
  }

  /**
   * Connect to the Kaspa network and initialize all services.
   *
   * @param {string} [rpcUrl] - WebSocket URL or null for public resolver.
   * @param {string} [networkId="testnet-10"] - Network ID.
   * @param {Object} [options] - Connection options.
   * @param {function} [options.onDisconnect] - Callback for disconnection.
   * @param {string} [options.balanceElementId] - DOM ID for auto-updating balance (Identity).
   * @param {boolean} [options.startIntelligence=true] - Whether to automatically start the Intelligence scanner/indexer.
   */
  async connect({
    rpcUrl,
    networkId = "testnet-10",
    onDisconnect,
    balanceElementId,
    onBalanceChange,
    startIntelligence = true,
    scannerOptions = {},
    indexerOptions = {},
  } = {}) {
    if (this._isReady) return this.transport.client;
    if (this._connectPromise) return this._connectPromise;

    this._connectPromise = (async () => {
      // 1. Connect Transport
      await this.transport.connect({
        rpcUrl,
        networkId,
        onDisconnect,
      });

      // 2. Initialize Identity
      await this.identity.init({
        client: this.transport.client,
        networkId,
        balanceElementId,
        onBalanceChange,
      });

      // 3. Inject Client into Intelligence
      this.intelligence = new IntelligenceFacade(
        this.transport.client,
        scannerOptions,
        indexerOptions,
      );

      await this.intelligence.init();

      // 4. Start Intelligence (optional)
      if (startIntelligence) {
        await this.intelligence.start();
      }

      this._isReady = true;
      return this.transport.client;
    })();

    try {
      return await this._connectPromise;
    } finally {
      this._connectPromise = null;
    }
  }

  /**
   * Disconnect from the network and shutdown services.
   */
  async disconnect() {
    this._isReady = false;
    if (this.intelligence) {
      this.intelligence.shutdown();
    }
    await this.transport.disconnect();
  }

  /**
   * Check if the portal is connected and all services are ready.
   */
  get isReady() {
    return this._isReady;
  }

  /**
   * Access the underlying RPC client directly.
   */
  get client() {
    return this.transport.client;
  }

  /**
   * Access the active wallet instance directly.
   */
  get wallet() {
    return this.identity.wallet;
  }

  // RPC Runner

  /**
   * Run an arbitrary RPC command using the connected client.
   * @param {string|Object} cmd - JSON string or object with {method, params}
   * @returns {Promise<any>}
   */
  async runRpcCommand(cmd) {
    if (!this.transport?.client) throw new Error("Not connected");
    // Accept both string and object
    let cmdText = typeof cmd === "string" ? cmd : JSON.stringify(cmd);
    return await this.transport.runRpcCommand(cmdText);
  }

  // --- Wallet Proxy Methods ---

  /**
   * Opens an existing wallet or creates a new one.
   * This is where you actually provide the password and mnemonic.
   * * @param {Object} options - { password, mnemonic, filename, storeMnemonic }
   * @returns {Promise<{address: string, mnemonic?: string}>}
   */
  async createOrOpenWallet(options) {
    if (!this._isReady) {
      throw new Error(
        "KaspaPortal: You must call connect() before opening a wallet.",
      );
    }
    const result = await this.identity.createOrOpenWallet(options);
    return result;
  }

  /**
   * Send a transaction (delegates to Identity).
   * @param {Object} options - { toAddress, amount, payload, priorityFeeKas }
   */
  async send(options) {
    return await this.identity.send(options);
  }

  /**
   * Get spendable balance (delegates to Identity).
   * @returns {Promise<bigint>}
   */
  async getBalance() {
    return await this.identity.getSpendableBalance();
  }

  /**
   * List all wallet filenames (delegates to Identity).
   * @returns {Promise<string[]>}
   */
  async getAllWallets() {
    return await this.identity.getAllWallets();
  }

  /**
   * Generate a new receiving address (delegates to Identity).
   * @returns {Promise<string>}
   */
  async generateNewAddress() {
    return await this.identity.generateNewAddress();
  }

  /**
   * Get private keys for signing transactions manually.
   * Required for manualSend() and splitUtxos() operations.
   * @param {Object} [options] - Options
   * @param {number} [options.keyCount=10] - Number of receive keys
   * @param {number} [options.changeKeyCount=5] - Number of change keys
   * @returns {Promise<Array>} Array of PrivateKey objects
   */
  async getPrivateKeys(options) {
    return await this.identity.getPrivateKeys(options);
  }

  // ─────────────────────────────────────────────────────────────
  // Manual Transaction Methods (Transport Proxy)
  // ─────────────────────────────────────────────────────────────

  /**
   * Manually build and send a transaction with full UTXO control.
   * Designed for rapid-fire transactions to avoid UTXO refresh delays.
   *
   * @param {Object} options
   * @param {string} options.fromAddress - Source address for UTXO lookup
   * @param {string} options.toAddress - Destination address
   * @param {string|bigint} options.amount - Amount to send (KAS string or sompi)
   * @param {string} [options.payload] - Optional payload
   * @param {Array} [options.privateKeys] - Private keys for signing
   * @param {bigint} [options.priorityFee=0n] - Priority fee in sompi
   * @param {number} [options.engineIndex] - Engine index for multi-engine mode
   * @param {number} [options.totalEngines] - Total engines for multi-engine mode
   * @returns {Promise<Object>} Transaction result
   */
  async manualSend(options) {
    return await this.transport.manualSend(options);
  }

  /**
   * Split UTXOs into multiple equal outputs for parallel transactions.
   * Use this before rapid-fire sends to prevent UTXO contention.
   *
   * @param {Object} options
   * @param {string} options.address - Address for UTXO lookup and outputs
   * @param {number} options.splitCount - Number of outputs (2-100)
   * @param {Array} options.privateKeys - Private keys for signing
   * @param {bigint} [options.priorityFee=0n] - Priority fee
   * @returns {Promise<Object>} Split result with txid and output details
   */
  async splitUtxos(options) {
    return await this.transport.splitUtxos(options);
  }

  /**
   * Consolidate all UTXOs into a target number of equal outputs.
   * This merges many small/medium UTXOs into fewer large ones.
   *
   * @param {Object} options
   * @param {string} options.address - Address for UTXO lookup and outputs
   * @param {Array} options.privateKeys - Private keys for signing
   * @param {number} [options.targetCount=5] - Number of outputs to create
   * @param {bigint} [options.priorityFee=0n] - Priority fee
   * @returns {Promise<Object>} Consolidation result
   */
  async consolidateUtxos(options) {
    return await this.transport.consolidateUtxos(options);
  }

  // ─────────────────────────────────────────────────────────────
  // Heartbeat Methods (Transport Proxy)
  // ─────────────────────────────────────────────────────────────

  /**
   * Get the wallet's change address.
   * @returns {Promise<string|null>}
   */
  async getChangeAddress() {
    try {
      const account = await this.identity?.getActiveAccount();
      return account?.changeAddress || null;
    } catch {
      return null;
    }
  }

  /**
   * Get both receive and change addresses for UTXO monitoring.
   * @returns {Promise<{ receiveAddress: string|null, changeAddress: string|null }>}
   */
  async getWalletAddresses() {
    try {
      const account = await this.identity?.getActiveAccount();
      return {
        receiveAddress: account?.receiveAddress || this.identity?.address || null,
        changeAddress: account?.changeAddress || null,
      };
    } catch {
      return {
        receiveAddress: this.identity?.address || null,
        changeAddress: null,
      };
    }
  }

  /**
   * Start the heartbeat monitor for automatic UTXO replenishment.
   * Checks UTXO count periodically and triggers splits if running low.
   * Enhanced to auto-detect and monitor both receive and change addresses.
   *
   * @param {Object} options
   * @param {string} [options.address] - Address to monitor (auto-detected if not provided)
   * @param {string} [options.changeAddress] - Change address to monitor (auto-detected if not provided)
   * @param {string[]} [options.addresses] - All addresses to monitor (alternative to address+changeAddress)
   * @param {boolean} [options.includeChangeAddress=true] - Whether to include change address
   * @param {Array} options.privateKeys - Private keys for splitting
   * @param {number} [options.intervalMs=30000] - Check interval (default 30s)
   * @param {number} [options.targetUtxoCount=10] - Minimum UTXO count threshold
   * @param {number} [options.splitCount=5] - Number of UTXOs to create when splitting
   * @param {bigint} [options.priorityFee=0n] - Priority fee for split transactions
   * @param {function} [options.onCheck] - Callback on each check ({ utxoCount, targetUtxoCount, totalBalance, entries, addresses })
   * @param {function} [options.onSplit] - Callback when split is triggered ({ previousCount, newCount, transactionId, result })
   * @param {function} [options.onError] - Callback on error ({ type: 'check'|'split', error })
   */
  async startHeartbeat(options = {}) {
    const { includeChangeAddress = true, ...restOptions } = options;

    // Auto-detect addresses from wallet if not provided
    if (!restOptions.addresses && (!restOptions.address || (includeChangeAddress && !restOptions.changeAddress))) {
      try {
        const walletAddresses = await this.getWalletAddresses();

        if (!restOptions.address && walletAddresses.receiveAddress) {
          restOptions.address = walletAddresses.receiveAddress;
        }

        if (includeChangeAddress && !restOptions.changeAddress && walletAddresses.changeAddress) {
          restOptions.changeAddress = walletAddresses.changeAddress;
        }
      } catch (err) {
        console.warn("[KaspaPortal] Failed to auto-detect wallet addresses for heartbeat:", err.message);
      }
    }

    return this.transport.startHeartbeat(restOptions);
  }

  /**
   * Stop the heartbeat monitor.
   */
  stopHeartbeat() {
    return this.transport.stopHeartbeat();
  }

  /**
   * Check if heartbeat is currently running.
   * @returns {boolean}
   */
  get isHeartbeatRunning() {
    return this.transport.isHeartbeatRunning;
  }

  /**
   * Get current heartbeat configuration (without private keys).
   * @returns {Object|null}
   */
  get heartbeatConfig() {
    return this.transport.heartbeatConfig;
  }

  /**
   * Manually trigger a heartbeat check.
   * @returns {Promise<void>}
   */
  async triggerHeartbeat() {
    return await this.transport.triggerHeartbeat();
  }

  /**
   * Analyze UTXOs for an address.
   * Returns count, categories (dust/small/medium/large), and totals.
   *
   * @param {string} address - Address to analyze
   * @returns {Promise<Object>} UTXO analysis
   */
  async analyzeUtxos(address) {
    return await this.transport.analyzeUtxos(address);
  }

  /**
   * Fetch UTXOs for an address.
   * @param {string} address - Kaspa address
   * @param {Object} [options] - { useCache, excludeSpent }
   * @returns {Promise<Array>} UTXO entries
   */
  async getUtxos(address, options) {
    return await this.transport.getUtxos(address, options);
  }

  /**
   * Mark UTXOs as spent (optimistic update for rapid sends).
   * @param {Array} entries - UTXO entries that were spent
   */
  markUtxosAsSpent(entries) {
    this.transport.markUtxosAsSpent(entries);
  }

  /**
   * Clear spent UTXO tracking.
   * @param {Array} [entries] - Specific entries or all if not provided
   */
  clearSpentUtxos(entries) {
    this.transport.clearSpentUtxos(entries);
  }

  /**
   * Invalidate UTXO cache for an address.
   * @param {string} [address] - Address or all if not provided
   */
  invalidateUtxoCache(address) {
    this.transport.invalidateUtxoCache(address);
  }

  /**
   * Build a manual transaction with explicit change handling.
   * @param {Object} options - Transaction options
   * @returns {Promise<Object>} Transaction details with pendingTx
   */
  async buildManualTransaction(options) {
    return await this.transport.buildManualTransaction(options);
  }

  /**
   * Build a UTXO split transaction.
   * @param {Object} options - Split options
   * @returns {Promise<Object>} Split transaction details
   */
  async buildSplitUtxoTransaction(options) {
    return await this.transport.buildSplitUtxoTransaction(options);
  }

  /**
   * Estimate fee for a transaction based on input/output counts.
   * @param {number} inputCount - Number of inputs
   * @param {number} outputCount - Number of outputs
   * @param {number} [payloadBytes=0] - Payload size in bytes
   * @returns {bigint} Estimated fee in sompi
   */
  estimateFee(inputCount, outputCount, payloadBytes = 0) {
    return this.transport.estimateFee(inputCount, outputCount, payloadBytes);
  }

  // --- Intelligence Proxy Methods ---

  // Scanner Methods

  /** Add an address to the watch list
   * @param {string} address - Kaspa address to watch
   */
  addAddress(address) {
    this.intelligence?.addAddress(address);
  }

  /** Remove an address from the watch list
   * @param {string} address - Kaspa address to remove
   */
  removeAddress(address) {
    this.intelligence?.removeAddress(address);
  }

  /** Set the list of addresses to watch
   * @param {Array<string>|string} addresses - Array of addresses or single address
   */
  setAddresses(addresses) {
    this.intelligence?.setAddresses(addresses);
  }

  /** Add a payload prefix to the watch list
   * @param {string} prefix - Payload prefix to add
   */
  addPrefix(prefix) {
    this.intelligence?.addPrefix(prefix);
  }

  /** Remove a payload prefix from the watch list
   * @param {string} prefix - Payload prefix to remove
   */
  removePrefix(prefix) {
    this.intelligence?.removePrefix(prefix);
  }

  /** Set the list of payload prefixes to watch
   * @param {Array<string>|string} prefixes - Array of prefixes or single prefix
   */
  setPrefixes(prefixes) {
    this.intelligence?.setPrefixes(prefixes);
  }

  /** Set scanner search mode */
  setSearchMode(mode) {
    this.intelligence?.setSearchMode(mode);
  }

  /** Start the live block scanner */
  async startScanner(onBlock) {
    return this.intelligence?.startScanner(onBlock);
  }

  /** Stop the live block scanner */
  stopScanner() {
    this.intelligence?.stopScanner();
  }

  // Indexer Methods

  _ensureIntelligence() {
    if (!this.intelligence) {
      throw new Error(
        "KaspaPortal: Intelligence not initialized. Call connect().",
      );
    }
  }

  getIndexerTimings() {
    this._ensureIntelligence();
    return this.intelligence.getIndexerTimings();
  }

  async startIndexer() {
    this._ensureIntelligence();
    return await this.intelligence.startIndexer();
  }

  stopIndexer() {
    this._ensureIntelligence();
    this.intelligence.stopIndexer();
  }

  async getCachedSnapshot() {
    this._ensureIntelligence();
    return await this.intelligence.getCachedSnapshot();
  }

  getInMemorySnapshot() {
    this._ensureIntelligence();
    return this.intelligence.getInMemorySnapshot();
  }

  async clearIndexerStore(storeName) {
    this._ensureIntelligence();
    return await this.intelligence.clearIndexerStore(storeName);
  }

  /**
   * Get all matching transactions from in-memory indexer.
   * @returns {Array} Array of matching transactions.
   */
  getAllMatchingTransactions() {
    this._ensureIntelligence();
    return this.intelligence.indexer?.getAllMatchingTransactions() || [];
  }

  /**
   * Get all matching transactions from IndexedDB cache.
   * @returns {Promise<Array>} Array of cached matching transactions.
   */
  async getAllCachedMatchingTransactions() {
    this._ensureIntelligence();
    return await (this.intelligence.indexer?.getAllCachedMatchingTransactions() ||
      Promise.resolve([]));
  }

  /**
   * Set the scanner prefix for payload matching.
   * @param {string} prefix - The prefix to match.
   */
  setScannerPrefix(prefix) {
    this._ensureIntelligence();
    if (this.intelligence.scanner) {
      this.intelligence.scanner.prefix = prefix;
    }
  }

  /**
   * Get the current scanner prefix.
   * @returns {string|null}
   */
  getScannerPrefix() {
    return this.intelligence?.scanner?.prefix || null;
  }

  /**
   * Sync indexer from a specific block hash to present.
   * @param {string} startHash
   * @param {function} [logFn]
   * @param {Object} [options]
   * @param {number} [options.maxSeconds=30]
   * @param {number} [options.minTimestamp=0]
   * @param {string[]} [options.prefixes] - Plain-text prefixes to match (hex-encoded internally)
   * @param {function|function[]} [options.onBlock] - Callback(s) for each block
   * @param {function|function[]} [options.onTransactionMatch] - Callback(s) for prefix matches
   */
  async syncFrom(
    startHash,
    logFn = null,
    {
      maxSeconds = 30,
      minTimestamp = 0,
      prefixes = [],
      onBlock = [],
      onTransactionMatch = [],
    } = {},
  ) {
    this._ensureIntelligence();
    return await this.intelligence.syncFrom(startHash, logFn, {
      maxSeconds,
      minTimestamp,
      prefixes,
      onBlock,
      onTransactionMatch,
    });
  }

  /**
   * Scan forward from a block for payload matches.
   */
  async findPayload(startHash, searchText, mode = "contains", options = {}) {
    this._ensureIntelligence();
    return await this.intelligence.findPayload(
      startHash,
      searchText,
      mode,
      options,
    );
  }

  /**
   * Historical scan backward from a block.
   */
  async findHistorical(startHash, matchFn, options = {}) {
    this._ensureIntelligence();
    return await this.intelligence.findHistorical(startHash, matchFn, options);
  }

  /**
   * Subscribe to new blocks (delegates to Intelligence).
   */
  onNewBlock(cb) {
    this.intelligence.onNewBlock(cb);
    return this;
  }

  /**
   * Subscribe to new transactions (delegates to Intelligence).
   */
  onNewTransaction(cb) {
    this.intelligence.onNewTransaction(cb);
    return this;
  }

  /**
   * Subscribe to new matching transactions (delegates to Intelligence).
   */
  onNewTransactionMatch(cb) {
    this.intelligence.onNewTransactionMatch(cb);
    return this;
  }

  /**
   * Subscribe to cached transactions (delegates to Intelligence).
   */
  onCachedTransaction(cb) {
    this.intelligence.onCachedTransaction(cb);
    return this;
  }

  /**
   * Subscribe to cached matching transactions (delegates to Intelligence).
   */
  onCachedTransactionMatch(cb) {
    this.intelligence.onCachedTransactionMatch(cb);
    return this;
  }

  /**
   * Subscribe to cached blocks (delegates to Intelligence).
   */
  onCachedBlock(cb) {
    this.intelligence.onCachedBlock(cb);
    return this;
  }

  /**
   * Subscribe to eviction events (delegates to Intelligence).
   */
  onEvict(cb) {
    this.intelligence.onEvict(cb);
    return this;
  }

  /**
   * Subscribe to cache eviction events (delegates to Intelligence).
   */
  onCacheEvict(cb) {
    this.intelligence.onCacheEvict(cb);
    return this;
  }

  // --- Crypto Proxy Methods ---

  /**
   * Encrypt a message (delegates to Crypto).
   */
  encrypt(text, password) {
    return this.crypto.encrypt(text, password);
  }

  /**
   * Decrypt a message (delegates to Crypto).
   */
  decrypt(encrypted, password) {
    return this.crypto.decrypt(encrypted, password);
  }

  /**
   * Derive two distinct keypairs (Signing & DH) from the same identity seed.
   * @param {number} index - The session or user index.
   */
  async generateIdentityKeys(index) {
    if (!this.identity.wallet?.walletInitialized) {
      throw new Error("KaspaPortal: Wallet must be initialized.");
    }
    // 1. Await the actual string from the facade
    const xprv = await this.identity.getXprv();

    // 2. Safety Check: If xprv is an object or undefined, WASM will crash
    if (typeof xprv !== "string") {
      throw new Error(`Expected xprv string, got ${typeof xprv}`);
    }
    return await this.crypto.generateIdentityKeys(xprv, index);
  }

  /**
   * Start a new Diffie-Hellman session using keys derived from the active wallet.
   * @param {number} index - Child index for key derivation.
   * @returns {Promise<DHSession>} An initialized DHSession object.
   */
  async startSession(index, privateKey) {
    if (!this.identity.wallet?.walletInitialized) {
      throw new Error(
        "KaspaPortal: Wallet must be initialized before starting a session.",
      );
    }
    if (privateKey) {
      return this.crypto.createDHSession(privateKey);
    }
    const { dh } = await this.generateIdentityKeys(index);
    return this.crypto.createDHSession(dh.privateKey, dh.publicKey);
  }

  /**
   * Sign an anchor object (delegates to Crypto).
   * @param {Object} anchor - The anchor to sign.
   * @returns {Promise<string>} The signature.
   */
  async signAnchor(anchor) {
    return await this.sessionManager.signAnchor(anchor);
  }

  /**
   * Sign a message (delegates to Crypto).
   * @param {string} privateKeyHex - Private key hex string.
   * @param {string} message - The canonicalized message body.
   * @returns {Promise<string>} The signature.
   */
  async signMessage(privateKeyHex, message) {
    return await this.crypto.signMessage(privateKeyHex, message);
  }

  /**
   * Verify a message signature (delegates to Crypto).
   * @param {string} publicKey - Public key hex string.
   * @param {string} body - The canonicalized message body.
   * @param {string} sig - The signature to verify.
   * @returns {Promise<boolean>} True if valid, false otherwise.
   */
  async verifyMessage(publicKey, body, sig) {
    return await this.crypto.verifyMessage(publicKey, body, sig);
  }

  // --- VRF Proxy Methods ---

  /** PROVE: Generates a VRF proof bundle (delegates to VRF).
   * @param {Object} options - { seedInput, btcBlocks, kasBlocks, iterations }
   * @returns {Promise<Object>} VRF proof object
   */
  async prove({ seedInput, btcBlocks = 6, kasBlocks = 12, iterations = 2 }) {
    return await this.vrf.prove({
      seedInput,
      btcBlocks,
      kasBlocks,
      iterations,
    });
  }

  /**
   * VERIFY: Validates the value against the proof bundle (delegates to VRF).
   * @param {string|Object} valueOrResult - The value or VRF result object.
   * @param {Object} [optionalProof] - The VRF proof object (if not included in valueOrResult).
   * @returns {Promise<boolean>} True if valid, false otherwise.
   */
  async verify(valueOrResult, optionalProof) {
    return await this.vrf.verify(valueOrResult, optionalProof);
  }

  /**
   * Fetch randomness blocks from various sources (delegates to VRF).
   * @param {string} source - 'bitcoin', 'kaspa', 'qrng', 'hybrid'
   * @param {number} n - Number of blocks/items
   * @returns {Promise<Object>}
   */
  async getKaspaBlocks(n) {
    return await this.vrf.getKaspaBlocks(n);
  }

  /**
   * Fetch Bitcoin blocks (delegates to VRF).
   * @param {number} n - Number of blocks
   * @returns {Promise<Array>}
   */
  async getBitcoinBlocks(n) {
    return await this.vrf.getBitcoinBlocks(n);
  }

  /**
   * Fetch QRNG data (delegates to VRF).
   * @param {string} provider - 'nist', 'anu', 'qrandom'
   * @param {number} length - Number of bytes
   * @returns {Promise<Array>}
   */
  async getQRNG(provider, length) {
    return await this.vrf.getQRNG(provider, length);
  }

  /**
   * Fold two sources of randomness (delegates to VRF).
   * @param {string} data1 - Hex string
   * @param {string} data2 - Hex string
   * @param {Object} options - { iterations }
   * @returns {Promise<string>} Folded result
   */
  async fold(data1, data2, options) {
    return await this.vrf.fold(data1, data2, options);
  }

  /**
   * Run the full NIST SP 800-22 test suite on a bitstring (delegates to VRF).
   * @param {string} bits - Binary string
   * @returns {Promise<Object[]>} Test results
   */
  async fullNIST(bits) {
    return await this.vrf.fullNIST(bits);
  }

  /**
   * Run a basic subset of NIST tests (delegates to VRF).
   * @param {string} bits - Binary string
   * @returns {Promise<Object[]>} Test results
   */
  async basicNIST(bits) {
    return await this.vrf.basicNIST(bits);
  }

  /** Verify VRF proof authenticity (delegates to VRF).
   * @param {Object} proof - VRF proof object
   * @returns {Promise<boolean>} True if valid, false otherwise
   */
  async isValidNistSignature(proof) {
    return await this.vrf.isValidNistSignature(proof);
  }

  /**
   * Generate full randomness using QRNG + Kaspa + BTC (delegates to VRF).
   * @returns {Promise<string>} Folded result hex
   */
  async generateFullRandomness() {
    const result = await this.vrf.generateFoldedEntropy({
      btcBlocks: 1,
      kasBlocks: 1,
      iterations: 2,
    });
    return result.finalOutput;
  }

  /**
   * Generate partial randomness using Kaspa + BTC only (no QRNG).
   * @returns {Promise<string>} Folded result hex
   */
  async generatePartialRandomness() {
    const result = await this.vrf.generatePartialEntropy({
      btcBlocks: 3,
      kasBlocks: 6,
      iterations: 3,
    });
    return result.finalOutput;
  }

  // --- KKTP Convenience Methods ---

  /**
   * Broadcast a signed discovery anchor and register as pending.
   * @param {Object} meta - Discovery meta object
   * @param {Object} [options] - { amount, toAddress }
   */
  async broadcastDiscovery(meta, options = {}) {
    return await this.sessionManager.broadcastDiscovery(meta, options);
  }

  /**
   * Respond to a discovery anchor and establish a session as responder.
   * @param {Object} discoveryAnchor - The peer's discovery anchor
   * @param {Object} [options] - { amount, toAddress }
   */
  async connectToPeer(discoveryAnchor, options = {}) {
    return await this.sessionManager.connectToPeer(discoveryAnchor, options);
  }

  /**
   * Send an encrypted KKTP message for a specific mailbox.
   * @param {string} mailboxId - Mailbox ID
   * @param {string} plaintext - Message plaintext
   * @param {Object} [options] - { amount, toAddress }
   */
  async sendMessage(mailboxId, plaintext, options = {}) {
    return await this.sessionManager.sendMessage(mailboxId, plaintext, options);
  }

  /**
   * Process an incoming KKTP payload (anchor or message).
   * @param {string} rawPayload
   * @returns {Promise<Object|null>}
   */
  async processIncomingPayload(rawPayload) {
    return await this.sessionManager.processIncomingPayload(rawPayload);
  }

  /**
   * Close and remove a KKTP session by mailboxId.
   * @param {string} mailboxId
   * @returns {boolean}
   */
  closeSession(mailboxId) {
    return this.sessionManager.closeSession(mailboxId);
  }

  /**
   * Get a specific KKTP session by mailboxId.
   * @param {string} mailboxId - The mailbox ID to look up
   * @returns {Object|undefined} Session context or undefined if not found
   */
  getSession(mailboxId) {
    return this.sessionManager.getSession(mailboxId);
  }

  /**
   * Get active KKTP sessions.
   * @returns {Array<Object>} Session contexts with mailboxId
   */
  getSessions() {
    return this.sessionManager.getSessions();
  }

  /** Export KKTP sessions to a snapshot.
   * @param {Object} [options]
   * @param {boolean} [options.includeMessages=true] - Whether to include message history
   * @returns {Object} Snapshot object
   */
  exportSessions({ includeMessages = true } = {}) {
    return this.sessionManager.exportSessions({ includeMessages });
  }

  /** Configure automatic resume persistence.
   * @param {Object} options
   * @param {string} [options.storageKeyPrefix="kktp_resume_"]
   * @param {function} [options.encryptFn] - Optional encrypt function
   * @param {number} [options.throttleMs=250]
   * @param {boolean} [options.includeMessages=true]
   */
  configureResumePersistence(options = {}) {
    return this.sessionManager.configureResumePersistence(options);
  }

  forcePersistAllSessions() {
    return this.sessionManager.forcePersistAllSessions();
  }

  /** Restore KKTP sessions from a snapshot.
   * @param {Object} snapshot - Snapshot object from exportSessions()
   * @param {Object} [options]
   * @param {boolean} [options.skipExpired=true] - Whether to skip expired sessions
   * @returns {Promise<Array>} Restored session contexts
   */
  async restoreSessions(snapshot, { skipExpired = true } = {}) {
    return await this.sessionManager.restoreSessions(snapshot, { skipExpired });
  }

  /** Prune expired sessions from memory.
   * @param {number} [nowMs=Date.now()]
   * @returns {number} Number of sessions pruned.
   */
  pruneExpiredSessions(nowMs = Date.now()) {
    return this.sessionManager.pruneExpiredSessions(nowMs);
  }

  /**
   * Sovereign Resume: Re-establishes a session and performs handover.
   * @param {Object} options
   * @param {string} [options.sid] - Old SID for resume key lookup
   * @param {string} [options.startHash] - Block hash to start DAG walk
   * @param {number} [options.maxSeconds=30] - Time budget for each sync phase
   * @param {function} [options.logFn] - Optional logger
   * @param {function} [options.decryptFn] - Decrypts the storage blob
   * @param {function} [options.encryptFn] - Encrypts the storage blob
   * @param {string} [options.storageKeyPrefix="kktp_resume_"]
   * @param {Object} [options.meta] - Extra discovery meta
   * @returns {Promise<Object>}
   */
  async resumeSession({
    sid,
    startHash,
    maxSeconds,
    logFn,
    decryptFn,
    encryptFn,
    storageKeyPrefix,
    meta,
  } = {}) {
    return await this.sessionManager.resumeSession({
      sid,
      startHash,
      maxSeconds,
      logFn,
      decryptFn,
      encryptFn,
      storageKeyPrefix,
      meta,
    });
  }

  /** Check if a session is expired.
   * @param {string} mailboxId
   * @param {number} [nowMs=Date.now()]
   * @returns {boolean}
   */
  isSessionExpired(mailboxId, nowMs = Date.now()) {
    return this.sessionManager.isSessionExpired(mailboxId, nowMs);
  }

  /**
   * Prepares a KKTP anchor for verification via KKTP Protocol.
   */
  prepareForVerification(anchor) {
    return this.sessionManager.prepareForVerification(anchor);
  }

  /** EXPOSED FOR AUDITORS:
   * RFC 8785 (JCS) Canonicalization.
   */
  canonicalize(obj) {
    return this.sessionManager.canonicalize(obj);
  }

  /** EXPOSED FOR AUDITORS:
   * Converts an object to plain JSON.
   */
  toPlainJson(value) {
    return this.sessionManager.toPlainJson(value);
  }

  /** EXPOSED FOR AUDITORS:
   * Strict JSON parsing.
   */
  strictParseJson(jsonString) {
    // Call SessionManager, which calls the static/singleton Protocol logic
    return this.sessionManager.strictParseJson(jsonString);
  }
}

// Instantiate it once here
export const kaspaPortal = new KaspaPortal();
