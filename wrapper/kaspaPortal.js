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
import { SessionFacade } from "../kktp/sessionFacade.js";
import { LobbyFacade, LOBBY_STATES, MEMBER_ROLES } from "../kktp/lobby/lobbyFacade.js";
import initKaspa from "./kas-wasm/kaspa.js";

let wasmInitialized = false;

// Re-export enums for convenience
export {
  SearchMode,
  IndexerEventType,
  MatchMode,
  EvictionReason,
  IndexerStore,
  LOBBY_STATES,
  MEMBER_ROLES,
};

/**
 * KaspaPortal - The Master Facade for Kaspa blockchain interactions.
 *
 * Provides a unified API for wallet management, transactions, real-time
 * blockchain monitoring, encrypted messaging (KKTP), and multiplayer lobbies.
 *
 * @example
 * ```javascript
 * import { kaspaPortal } from './kaspaPortal.js';
 *
 * // Initialize and connect
 * await kaspaPortal.init();
 * await kaspaPortal.connect({ networkId: 'testnet-10' });
 * await kaspaPortal.createOrOpenWallet({ password: 'myPassword' });
 *
 * // Send a transaction
 * await kaspaPortal.send({ toAddress: 'kaspa:...', amount: '1.5' });
 *
 * // Host a multiplayer lobby
 * await kaspaPortal.hostLobby({ lobbyName: 'Game Room', gameName: 'MyGame' });
 * ```
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                       KaspaPortal                           │
 * ├─────────────────────────────────────────────────────────────┤
 * │  Transport    │ Identity   │ Intelligence │ Crypto │ VRF   │
 * ├─────────────────────────────────────────────────────────────┤
 * │              SessionFacade (KKTP Protocol)                  │
 * │                      └── LobbyFacade                        │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 */
export class KaspaPortal {
  constructor() {
    this._isReady = false;
    this._connectPromise = null;

    // Core sub-facades (always available)
    this.transport = new TransportFacade();
    this.identity = new IdentityFacade();
    this.crypto = new CryptoFacade();
    this.vrf = new VRFFacade(false);

    // Initialized on connect()
    this.intelligence = null;
    this._session = null;
    this._lobby = null;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize the Kaspa WebAssembly module.
   * Call this once before using any other methods.
   *
   * @returns {Promise<void>}
   * @example
   * await kaspaPortal.init();
   */
  async init() {
    if (!wasmInitialized) {
      await initKaspa();
      wasmInitialized = true;
    }
  }

  /**
   * Connect to the Kaspa network and initialize all services.
   *
   * @param {Object} [options] - Connection options
   * @param {string} [options.rpcUrl] - WebSocket URL (uses public resolver if omitted)
   * @param {string} [options.networkId='testnet-10'] - Network to connect to
   * @param {Function} [options.onDisconnect] - Called when connection is lost
   * @param {string} [options.balanceElementId] - DOM element ID for auto-updating balance display
   * @param {Function} [options.onBalanceChange] - Called when wallet balance changes
   * @param {boolean} [options.startIntelligence=true] - Start blockchain scanner automatically
   * @param {Object} [options.scannerOptions] - Scanner configuration
   * @param {Object} [options.indexerOptions] - Indexer configuration
   * @returns {Promise<Object>} The RPC client instance
   *
   * @example
   * await kaspaPortal.connect({
   *   networkId: 'testnet-10',
   *   onBalanceChange: (balance) => console.log('Balance:', balance)
   * });
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
      await this.transport.connect({ rpcUrl, networkId, onDisconnect });

      await this.identity.init({
        client: this.transport.client,
        networkId,
        balanceElementId,
        onBalanceChange,
      });

      this.intelligence = new IntelligenceFacade(
        this.transport.client,
        scannerOptions,
        indexerOptions,
      );
      await this.intelligence.init();

      if (startIntelligence) {
        await this.intelligence.start();
      }

      // KKTP facades are lazy-initialized on first access via getters
      // This avoids initializing KKTP for demos that don't need it

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
   * Disconnect from the network and clean up all services.
   * Stops the scanner, indexer, and clears session/lobby state.
   *
   * @returns {Promise<void>}
   */
  async disconnect() {
    this._isReady = false;
    this._session = null;
    this._lobby = null;
    if (this.intelligence) {
      this.intelligence.shutdown();
      this.intelligence = null;
    }
    await this.transport.disconnect();
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: STATE ACCESSORS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if the portal is connected and ready to use.
   * @returns {boolean}
   */
  get isReady() {
    return this._isReady;
  }

  /**
   * Access the raw RPC client for advanced operations.
   * @returns {Object|null} The Kaspa RPC client
   */
  get client() {
    return this.transport.client;
  }

  /**
   * Access the active wallet instance.
   * @returns {Object|null} The wallet context
   */
  get wallet() {
    return this.identity.wallet;
  }

  /**
   * Get the wallet's primary receiving address.
   * @returns {string|null} The Kaspa address
   */
  get address() {
    return this.identity.address;
  }

  /**
   * Access the KKTP SessionFacade for advanced session operations.
   * Lazily initialized on first access.
   * @returns {SessionFacade}
   * @throws {Error} If not connected
   */
  get sessionManager() {
    if (!this._isReady) {
      throw new Error("KaspaPortal: Not connected. Call connect() first.");
    }
    if (!this._session) {
      this._session = new SessionFacade(this);
    }
    return this._session;
  }

  /**
   * Access the LobbyFacade for advanced lobby operations.
   * Lazily initialized on first access.
   * @returns {LobbyFacade}
   * @throws {Error} If not connected
   */
  get lobbyManager() {
    if (!this._isReady) {
      throw new Error("KaspaPortal: Not connected. Call connect() first.");
    }
    if (!this._lobby) {
      this._lobby = new LobbyFacade(this.sessionManager);
    }
    return this._lobby;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: WALLET (Identity Proxy)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a new wallet or open an existing one.
   *
   * @param {Object} options - Wallet options
   * @param {string} options.password - Password to encrypt/decrypt the wallet
   * @param {string} [options.filename] - Wallet filename (defaults to 'default')
   * @param {string} [options.mnemonic] - Import existing mnemonic (12 or 24 words)
   * @param {boolean} [options.storeMnemonic=false] - Store mnemonic in browser storage
   * @returns {Promise<{address: string, mnemonic?: string}>} Wallet info
   *
   * @example
   * const { address, mnemonic } = await kaspaPortal.createOrOpenWallet({
   *   password: 'securePassword123',
   *   filename: 'my-wallet'
   * });
   */
  async createOrOpenWallet(options) {
    if (!this._isReady) {
      throw new Error("KaspaPortal: Call connect() before opening a wallet.");
    }
    return await this.identity.createOrOpenWallet(options);
  }

  /**
   * Send KAS to an address using the wallet's built-in transaction builder.
   *
   * @param {Object} options - Transaction options
   * @param {string} options.toAddress - Recipient Kaspa address
   * @param {string|number} options.amount - Amount in KAS (e.g., '1.5')
   * @param {string} [options.payload] - Optional OP_RETURN data
   * @param {number} [options.priorityFeeKas] - Priority fee in KAS
   * @returns {Promise<Object>} Transaction result with txid
   *
   * @example
   * const result = await kaspaPortal.send({
   *   toAddress: 'kaspa:qz...',
   *   amount: '2.5',
   *   payload: 'Hello Kaspa!'
   * });
   */
  async send(options) {
    return await this.identity.send(options);
  }

  /**
   * Get the wallet's spendable balance in sompi.
   * @returns {Promise<bigint>} Balance in sompi (1 KAS = 100,000,000 sompi)
   */
  async getBalance() {
    return await this.identity.getSpendableBalance();
  }

  /**
   * List all wallet filenames stored in browser storage.
   * @returns {Promise<string[]>} Array of wallet filenames
   */
  async getAllWallets() {
    return await this.identity.getAllWallets();
  }

  /**
   * Generate a new receiving address for the wallet.
   * @returns {Promise<string>} New Kaspa address
   */
  async generateNewAddress() {
    return await this.identity.generateNewAddress();
  }

  /**
   * Get private keys for manual transaction signing.
   * Required for `manualSend()` and `splitUtxos()`.
   *
   * @param {Object} [options] - Key derivation options
   * @param {number} [options.keyCount=10] - Number of receive address keys
   * @param {number} [options.changeKeyCount=5] - Number of change address keys
   * @returns {Promise<Array>} Array of PrivateKey objects
   */
  async getPrivateKeys(options) {
    return await this.identity.getPrivateKeys(options);
  }

  /**
   * Close the active wallet and clear sensitive data from memory.
   * @returns {Promise<void>}
   */
  async closeWallet() {
    return await this.identity.closeWallet();
  }

  /**
   * Switch to a different account within the wallet.
   * @param {number} index - Account index (0-based)
   * @returns {Promise<void>}
   */
  async setActiveAccount(index) {
    return await this.identity.setActiveAccount(index);
  }

  /**
   * Delete a wallet from browser storage.
   * @param {string} filename - Wallet filename to delete
   * @returns {Promise<void>}
   */
  async deleteWallet(filename) {
    return await this.identity.deleteWallet(filename);
  }

  /**
   * Get the wallet's mnemonic phrase (12 or 24 words).
   * @returns {Promise<string>} Space-separated mnemonic words
   */
  async getMnemonic() {
    return await this.identity.getMnemonic();
  }

  /**
   * Get the wallet's change address.
   * @returns {Promise<string|null>} Change address or null
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
   * Get both receive and change addresses for the wallet.
   * @returns {Promise<{receiveAddress: string|null, changeAddress: string|null}>}
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

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: TRANSACTIONS (Transport Proxy)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Execute a raw RPC command against the Kaspa node.
   *
   * @param {string|Object} cmd - RPC command as JSON string or object
   * @returns {Promise<any>} RPC response
   *
   * @example
   * const info = await kaspaPortal.runRpcCommand({ method: 'getBlockDagInfo' });
   */
  async runRpcCommand(cmd) {
    if (!this.transport?.client) throw new Error("Not connected");
    const cmdText = typeof cmd === "string" ? cmd : JSON.stringify(cmd);
    return await this.transport.runRpcCommand(cmdText);
  }

  /**
   * Send a transaction with full UTXO control.
   * Use this for rapid-fire transactions or when you need precise UTXO selection.
   *
   * @param {Object} options - Transaction options
   * @param {string} options.fromAddress - Source address
   * @param {string} options.toAddress - Destination address
   * @param {string|bigint} options.amount - Amount in KAS or sompi
   * @param {string} [options.payload] - OP_RETURN payload
   * @param {Array} options.privateKeys - Keys from `getPrivateKeys()`
   * @param {bigint} [options.priorityFee=0n] - Priority fee in sompi
   * @returns {Promise<Object>} Transaction result
   *
   * @example
   * const keys = await kaspaPortal.getPrivateKeys();
   * await kaspaPortal.manualSend({
   *   fromAddress: kaspaPortal.address,
   *   toAddress: 'kaspa:qz...',
   *   amount: '1',
   *   privateKeys: keys
   * });
   */
  async manualSend(options) {
    return await this.transport.manualSend(options);
  }

  /**
   * Split UTXOs into multiple equal outputs for parallel transactions.
   * Call this before rapid-fire sends to prevent UTXO contention.
   *
   * @param {Object} options - Split options
   * @param {string} options.address - Address containing UTXOs
   * @param {number} options.splitCount - Number of outputs (2-100)
   * @param {Array} options.privateKeys - Keys from `getPrivateKeys()`
   * @param {bigint} [options.priorityFee=0n] - Priority fee
   * @returns {Promise<Object>} Split result with txid
   *
   * @example
   * await kaspaPortal.splitUtxos({
   *   address: kaspaPortal.address,
   *   splitCount: 10,
   *   privateKeys: await kaspaPortal.getPrivateKeys()
   * });
   */
  async splitUtxos(options) {
    return await this.transport.splitUtxos(options);
  }

  /**
   * Consolidate many UTXOs into fewer, larger ones.
   * Reduces wallet fragmentation and prepares for larger transactions.
   *
   * @param {Object} options - Consolidation options
   * @param {string} options.address - Address to consolidate
   * @param {Array} options.privateKeys - Keys from `getPrivateKeys()`
   * @param {number} [options.targetCount=5] - Target number of output UTXOs
   * @param {bigint} [options.priorityFee=0n] - Priority fee
   * @returns {Promise<Object>} Consolidation result
   */
  async consolidateUtxos(options) {
    return await this.transport.consolidateUtxos(options);
  }

  /**
   * Build a transaction without broadcasting it.
   * @param {Object} options - Transaction options
   * @returns {Promise<Object>} Unsigned transaction
   */
  async buildManualTransaction(options) {
    return await this.transport.buildManualTransaction(options);
  }

  /**
   * Build a UTXO split transaction without broadcasting it.
   * @param {Object} options - Split options
   * @returns {Promise<Object>} Unsigned split transaction
   */
  async buildSplitUtxoTransaction(options) {
    return await this.transport.buildSplitUtxoTransaction(options);
  }

  /**
   * Estimate transaction fee based on input/output counts.
   *
   * @param {number} inputCount - Number of inputs
   * @param {number} outputCount - Number of outputs
   * @param {number} [payloadBytes=0] - Payload size in bytes
   * @returns {bigint} Estimated fee in sompi
   */
  estimateFee(inputCount, outputCount, payloadBytes = 0) {
    return this.transport.estimateFee(inputCount, outputCount, payloadBytes);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: UTXO MANAGEMENT (Transport Proxy)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Fetch UTXOs for an address.
   *
   * @param {string} address - Kaspa address
   * @param {Object} [options] - Fetch options
   * @param {boolean} [options.useCache=false] - Use cached UTXOs if available
   * @param {boolean} [options.excludeSpent=true] - Filter out optimistically spent UTXOs
   * @returns {Promise<Array>} Array of UTXO entries
   */
  async getUtxos(address, options) {
    return await this.transport.getUtxos(address, options);
  }

  /**
   * Analyze UTXOs for an address - count, categories, and totals.
   *
   * @param {string} address - Kaspa address
   * @returns {Promise<Object>} Analysis with dust/small/medium/large counts
   */
  async analyzeUtxos(address) {
    return await this.transport.analyzeUtxos(address);
  }

  /**
   * Mark UTXOs as spent for optimistic UI updates.
   * Prevents double-spending during rapid transactions.
   * @param {Array} entries - UTXO entries that were spent
   */
  markUtxosAsSpent(entries) {
    this.transport.markUtxosAsSpent(entries);
  }

  /**
   * Clear spent UTXO tracking (after confirmation or on refresh).
   * @param {Array} [entries] - Specific entries to clear, or all if omitted
   */
  clearSpentUtxos(entries) {
    this.transport.clearSpentUtxos(entries);
  }

  /**
   * Invalidate cached UTXOs to force a fresh fetch.
   * @param {string} [address] - Specific address or all if omitted
   */
  invalidateUtxoCache(address) {
    this.transport.invalidateUtxoCache(address);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: HEARTBEAT (Transport Proxy)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Start automatic UTXO monitoring and replenishment.
   * Ensures you always have enough UTXOs for rapid transactions.
   *
   * @param {Object} [options] - Heartbeat options
   * @param {string} [options.address] - Address to monitor (auto-detected if omitted)
   * @param {Array} options.privateKeys - Keys for auto-split transactions
   * @param {number} [options.intervalMs=30000] - Check interval in milliseconds
   * @param {number} [options.targetUtxoCount=10] - Minimum UTXO count to maintain
   * @param {Function} [options.onCheck] - Called on each heartbeat check
   * @param {Function} [options.onSplit] - Called when auto-split occurs
   * @returns {Promise<void>}
   *
   * @example
   * await kaspaPortal.startHeartbeat({
   *   privateKeys: await kaspaPortal.getPrivateKeys(),
   *   targetUtxoCount: 5,
   *   onCheck: ({ utxoCount }) => console.log('UTXOs:', utxoCount)
   * });
   */
  async startHeartbeat(options = {}) {
    const { includeChangeAddress = true, ...restOptions } = options;

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
        console.warn("[KaspaPortal] Failed to auto-detect wallet addresses:", err.message);
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
   * Check if the heartbeat monitor is running.
   * @returns {boolean}
   */
  get isHeartbeatRunning() {
    return this.transport.isHeartbeatRunning;
  }

  /**
   * Get current heartbeat configuration (excludes private keys).
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

  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: INTELLIGENCE - Scanner (Intelligence Proxy)
  // ═══════════════════════════════════════════════════════════════

  /** @private */
  _ensureIntelligence() {
    if (!this.intelligence) {
      throw new Error("KaspaPortal: Intelligence not initialized. Call connect().");
    }
  }

  /**
   * Add an address to the scanner's watch list.
   * Transactions involving this address will trigger events.
   * @param {string} address - Kaspa address to watch
   */
  addAddress(address) {
    this.intelligence?.addAddress(address);
  }

  /**
   * Remove an address from the watch list.
   * @param {string} address - Address to stop watching
   */
  removeAddress(address) {
    this.intelligence?.removeAddress(address);
  }

  /**
   * Replace the watch list with a new set of addresses.
   * @param {string|string[]} addresses - Address or array of addresses
   */
  setAddresses(addresses) {
    this.intelligence?.setAddresses(addresses);
  }

  /**
   * Add a payload prefix to watch for.
   * Transactions with matching OP_RETURN data will trigger events.
   * @param {string} prefix - Prefix to match (e.g., 'KKTP:')
   */
  addPrefix(prefix) {
    this.intelligence?.addPrefix(prefix);
  }

  /**
   * Remove a prefix from the watch list.
   * @param {string} prefix - Prefix to stop watching
   */
  removePrefix(prefix) {
    this.intelligence?.removePrefix(prefix);
  }

  /**
   * Replace the prefix list with a new set.
   * @param {string|string[]} prefixes - Prefix or array of prefixes
   */
  setPrefixes(prefixes) {
    this.intelligence?.setPrefixes(prefixes);
  }

  /**
   * Set the scanner's search mode.
   * @param {SearchMode} mode - Search mode enum value
   */
  setSearchMode(mode) {
    this.intelligence?.setSearchMode(mode);
  }

  /**
   * Set a single scanner prefix (convenience method).
   * @param {string} prefix - Prefix to match
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
   * Start the live blockchain scanner.
   * @param {Function} [onBlock] - Called for each new block
   * @returns {Promise<void>}
   */
  async startScanner(onBlock) {
    return this.intelligence?.startScanner(onBlock);
  }

  /**
   * Stop the live blockchain scanner.
   */
  stopScanner() {
    this.intelligence?.stopScanner();
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: INTELLIGENCE - Indexer (Intelligence Proxy)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get indexer timing configuration.
   * @returns {{ttlMs: number, flushInterval: number}}
   */
  getIndexerTimings() {
    this._ensureIntelligence();
    return this.intelligence.getIndexerTimings();
  }

  /**
   * Start the indexer for caching transactions to IndexedDB.
   * @returns {Promise<Object>} Indexer timing info
   */
  async startIndexer() {
    this._ensureIntelligence();
    return await this.intelligence.startIndexer();
  }

  /**
   * Stop the indexer.
   */
  stopIndexer() {
    this._ensureIntelligence();
    this.intelligence.stopIndexer();
  }

  /**
   * Shutdown the entire Intelligence layer (scanner + indexer).
   */
  shutdownIntelligence() {
    if (this.intelligence) {
      this.intelligence.shutdown();
    }
  }

  /**
   * Get all cached data from IndexedDB.
   * @returns {Promise<{allTxs: Array, matchingTxs: Array, blocks: Array}>}
   */
  async getCachedSnapshot() {
    this._ensureIntelligence();
    return await this.intelligence.getCachedSnapshot();
  }

  /**
   * Get all in-memory data (not yet persisted).
   * @returns {{allTxs: Array, matchingTxs: Array, blocks: Array}}
   */
  getInMemorySnapshot() {
    this._ensureIntelligence();
    return this.intelligence.getInMemorySnapshot();
  }

  /**
   * Clear a specific IndexedDB store.
   * @param {IndexerStore} storeName - Store to clear
   * @returns {Promise<void>}
   */
  async clearIndexerStore(storeName) {
    this._ensureIntelligence();
    return await this.intelligence.clearIndexerStore(storeName);
  }

  /**
   * Get all matching transactions from memory.
   * @returns {Array} Transactions matching your prefix/address filters
   */
  getAllMatchingTransactions() {
    this._ensureIntelligence();
    return this.intelligence.indexer?.getAllMatchingTransactions() || [];
  }

  /**
   * Get all matching transactions from IndexedDB cache.
   * @returns {Promise<Array>}
   */
  async getAllCachedMatchingTransactions() {
    this._ensureIntelligence();
    return await (this.intelligence.indexer?.getAllCachedMatchingTransactions() || Promise.resolve([]));
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 9: INTELLIGENCE - Search & Sync (Intelligence Proxy)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Fetch a specific block by its hash.
   *
   * @param {string} blockHash - 64-character hex block hash
   * @returns {Promise<Object|null>} Block data with transactions, or null if not found
   *
   * @example
   * const block = await kaspaPortal.fetchBlockByHash('abc123...');
   * console.log('Transactions:', block.transactions.length);
   */
  async fetchBlockByHash(blockHash) {
    if (!this.transport?.client) {
      throw new Error("KaspaPortal: Not connected to network.");
    }
    if (!blockHash || blockHash.length !== 64) {
      throw new Error("KaspaPortal: Invalid block hash (must be 64 hex characters).");
    }

    try {
      // Kaspa WASM RPC expects IGetBlockRequest: { hash, includeTransactions }
      const response = await this.transport.client.getBlock({
        hash: blockHash,
        includeTransactions: true,
      });
      return response?.block || null;
    } catch (err) {
      console.warn(`KaspaPortal: Failed to fetch block ${blockHash.slice(0, 16)}...`, err?.message || err);
      return null;
    }
  }

  /**
   * Sync the indexer from a starting block to the present.
   *
   * @param {string} startHash - Block hash to start from
   * @param {Function} [logFn] - Logging callback
   * @param {Object} [options] - Sync options
   * @returns {Promise<void>}
   */
  async syncFrom(startHash, logFn = null, options = {}) {
    this._ensureIntelligence();
    return await this.intelligence.syncFrom(startHash, logFn, options);
  }

  /**
   * Search forward from a block for matching payloads.
   *
   * @param {string} startHash - Starting block hash
   * @param {string} searchText - Text to find in payloads
   * @param {string} [mode='contains'] - Match mode: 'contains', 'startsWith', 'exact'
   * @param {Object} [options] - Search options
   * @returns {Promise<Array>} Array of matches
   */
  async findPayload(startHash, searchText, mode = "contains", options = {}) {
    this._ensureIntelligence();
    return await this.intelligence.findPayload(startHash, searchText, mode, options);
  }

  /**
   * Search backward through history for matching transactions.
   *
   * @param {string} startHash - Starting block hash
   * @param {Function} matchFn - Function(block, tx) returning true for matches
   * @param {Object} [options] - Search options
   * @returns {Promise<Array>} Array of matches
   */
  async findHistorical(startHash, matchFn, options = {}) {
    this._ensureIntelligence();
    return await this.intelligence.findHistorical(startHash, matchFn, options);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 10: INTELLIGENCE - Event Subscriptions
  // ═══════════════════════════════════════════════════════════════

  /**
   * Subscribe to new block events.
   * @param {Function} cb - Callback receiving block data
   * @returns {this} For chaining
   */
  onNewBlock(cb) {
    this._ensureIntelligence();
    this.intelligence.onNewBlock(cb);
    return this;
  }

  /**
   * Subscribe to all new transaction events.
   * @param {Function} cb - Callback receiving transaction data
   * @returns {this} For chaining
   */
  onNewTransaction(cb) {
    this._ensureIntelligence();
    this.intelligence.onNewTransaction(cb);
    return this;
  }

  /**
   * Subscribe to transactions matching your filters (prefix/address).
   * This is the primary event for KKTP message detection.
   *
   * @param {Function} cb - Callback receiving match data
   * @returns {this} For chaining
   *
   * @example
   * kaspaPortal.onNewTransactionMatch((match) => {
   *   console.log('KKTP payload found:', match.payload);
   * });
   */
  onNewTransactionMatch(cb) {
    this._ensureIntelligence();
    this.intelligence.onNewTransactionMatch(cb);
    return this;
  }

  /**
   * Subscribe to blocks being cached to IndexedDB.
   * @param {Function} cb - Callback
   * @returns {this} For chaining
   */
  onCachedBlock(cb) {
    this._ensureIntelligence();
    this.intelligence.onCachedBlock(cb);
    return this;
  }

  /**
   * Subscribe to transactions being cached.
   * @param {Function} cb - Callback
   * @returns {this} For chaining
   */
  onCachedTransaction(cb) {
    this._ensureIntelligence();
    this.intelligence.onCachedTransaction(cb);
    return this;
  }

  /**
   * Subscribe to matching transactions being cached.
   * @param {Function} cb - Callback
   * @returns {this} For chaining
   */
  onCachedTransactionMatch(cb) {
    this._ensureIntelligence();
    this.intelligence.onCachedTransactionMatch(cb);
    return this;
  }

  /**
   * Subscribe to eviction events (memory cleanup).
   * @param {Function} cb - Callback
   * @returns {this} For chaining
   */
  onEvict(cb) {
    this._ensureIntelligence();
    this.intelligence.onEvict(cb);
    return this;
  }

  /**
   * Subscribe to cache eviction events (IndexedDB cleanup).
   * @param {Function} cb - Callback
   * @returns {this} For chaining
   */
  onCacheEvict(cb) {
    this._ensureIntelligence();
    this.intelligence.onCacheEvict(cb);
    return this;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 11: CRYPTOGRAPHY (Crypto Proxy)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Encrypt text with a password using AES-256.
   * @param {string} text - Plaintext to encrypt
   * @param {string} password - Encryption password
   * @returns {string} Encrypted string (base64)
   */
  encrypt(text, password) {
    return this.crypto.encrypt(text, password);
  }

  /**
   * Decrypt text with a password.
   * @param {string} encrypted - Encrypted string
   * @param {string} password - Decryption password
   * @returns {string} Decrypted plaintext
   */
  decrypt(encrypted, password) {
    return this.crypto.decrypt(encrypted, password);
  }

  /**
   * Sign a message with a private key.
   * @param {string} privateKeyHex - Private key as hex string
   * @param {string} message - Message to sign
   * @returns {Promise<string>} Signature
   */
  async signMessage(privateKeyHex, message) {
    return await this.crypto.signMessage(privateKeyHex, message);
  }

  /**
   * Verify a message signature.
   * @param {string} publicKey - Public key
   * @param {string} body - Original message
   * @param {string} sig - Signature to verify
   * @returns {Promise<boolean>} True if valid
   */
  async verifyMessage(publicKey, body, sig) {
    return await this.crypto.verifyMessage(publicKey, body, sig);
  }

  /**
   * Generate signing and Diffie-Hellman key pairs for KKTP identity.
   *
   * @param {number} index - Derivation index
   * @returns {Promise<{sig: {publicKey, privateKey}, dh: {publicKey, privateKey}}>}
   * @throws {Error} If wallet is not initialized
   */
  async generateIdentityKeys(index) {
    if (!this.identity.wallet?.walletInitialized) {
      throw new Error("KaspaPortal: Wallet must be initialized.");
    }
    const xprv = await this.identity.getXprv();
    if (typeof xprv !== "string") {
      throw new Error(`Expected xprv string, got ${typeof xprv}`);
    }
    return await this.crypto.generateIdentityKeys(xprv, index);
  }

  /**
   * Start a Diffie-Hellman session for encrypted communication.
   *
   * @param {number} index - Derivation index
   * @param {string} [privateKey] - Existing private key (optional)
   * @returns {Promise<Object>} DH session with computeSharedSecret method
   */
  async startSession(index, privateKey) {
    if (!this.identity.wallet?.walletInitialized) {
      throw new Error("KaspaPortal: Wallet must be initialized before starting a session.");
    }
    if (privateKey) {
      return this.crypto.createDHSession(privateKey);
    }
    const { dh } = await this.generateIdentityKeys(index);
    return this.crypto.createDHSession(dh.privateKey, dh.publicKey);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 12: VRF & RANDOMNESS (VRF Proxy)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate a verifiable random proof using blockchain entropy.
   *
   * @param {Object} options - VRF options
   * @param {string} options.seedInput - Seed value
   * @param {number} [options.btcBlocks=6] - Bitcoin blocks to use
   * @param {number} [options.kasBlocks=12] - Kaspa blocks to use
   * @returns {Promise<{finalOutput: string, proof: Object}>}
   */
  async prove(options) {
    return await this.vrf.prove(options);
  }

  /**
   * Verify a VRF proof.
   *
   * @param {string|Object} valueOrResult - Value or result object to verify
   * @param {Object} [optionalProof] - Proof if not included in first param
   * @returns {Promise<boolean>} True if valid
   */
  async verify(valueOrResult, optionalProof) {
    return await this.vrf.verify(valueOrResult, optionalProof);
  }

  /**
   * Fetch recent Kaspa block hashes for entropy.
   * @param {number} n - Number of blocks
   * @returns {Promise<Array>}
   */
  async getKaspaBlocks(n) {
    return await this.vrf.getKaspaBlocks(n);
  }

  /**
   * Fetch recent Bitcoin block hashes for entropy.
   * @param {number} n - Number of blocks
   * @returns {Promise<Array>}
   */
  async getBitcoinBlocks(n) {
    return await this.vrf.getBitcoinBlocks(n);
  }

  /**
   * Fetch quantum random numbers from a QRNG provider.
   * @param {string} provider - 'nist', 'anu', or 'qrandom'
   * @param {number} length - Number of bytes
   * @returns {Promise<Array>}
   */
  async getQRNG(provider, length) {
    return await this.vrf.getQRNG(provider, length);
  }

  /**
   * Fold two entropy sources together.
   * @param {string} data1 - First hex string
   * @param {string} data2 - Second hex string
   * @param {Object} [options] - Folding options
   * @returns {Promise<string>} Folded result
   */
  async fold(data1, data2, options) {
    return await this.vrf.fold(data1, data2, options);
  }

  /**
   * Run the full NIST SP 800-22 randomness test suite.
   * @param {string} bits - Binary string to test
   * @returns {Promise<Array>} Test results
   */
  async fullNIST(bits) {
    return await this.vrf.fullNIST(bits);
  }

  /**
   * Run basic NIST randomness tests (subset).
   * @param {string} bits - Binary string to test
   * @returns {Promise<Array>} Test results
   */
  async basicNIST(bits) {
    return await this.vrf.basicNIST(bits);
  }

  /**
   * Verify a NIST beacon signature.
   * @param {Object} proof - Proof containing NIST data
   * @returns {Promise<boolean>}
   */
  async isValidNistSignature(proof) {
    return await this.vrf.isValidNistSignature(proof);
  }

  /**
   * Generate high-quality randomness from QRNG, Bitcoin, and Kaspa.
   * @returns {Promise<string>} 64-character hex string
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
   * Generate randomness from Bitcoin and Kaspa only (no QRNG).
   * Use as fallback when QRNG is unavailable.
   * @returns {Promise<string>} 64-character hex string
   */
  async generatePartialRandomness() {
    const result = await this.vrf.generatePartialEntropy({
      btcBlocks: 3,
      kasBlocks: 6,
      iterations: 3,
    });
    return result.finalOutput;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 13: KKTP PROTOCOL (SessionFacade Proxy)
  // ═══════════════════════════════════════════════════════════════

  // --- Protocol Utilities ---

  /**
   * Sign a KKTP anchor with your identity.
   * @param {Object} anchor - Anchor to sign
   * @returns {Promise<Object>} Signed anchor
   */
  async signAnchor(anchor) {
    return await this.sessionManager.signAnchor(anchor);
  }

  /**
   * Prepare an anchor for signature verification.
   * @param {Object} anchor - Anchor to prepare
   * @returns {Object} Prepared anchor
   */
  prepareForVerification(anchor) {
    return this.sessionManager.prepareForVerification(anchor);
  }

  /**
   * Canonicalize an object for consistent hashing.
   * @param {Object} obj - Object to canonicalize
   * @returns {string} Canonical JSON string
   */
  canonicalize(obj) {
    return this.sessionManager.canonicalize(obj);
  }

  /**
   * Convert a value to plain JSON (removes class instances).
   * @param {any} value - Value to convert
   * @returns {Object}
   */
  toPlainJson(value) {
    return this.sessionManager.toPlainJson(value);
  }

  /**
   * Parse JSON with strict validation.
   * @param {string} jsonString - JSON to parse
   * @returns {Object}
   */
  strictParseJson(jsonString) {
    return this.sessionManager.strictParseJson(jsonString);
  }

  // --- Session Lifecycle ---

  /**
   * Broadcast a discovery anchor to make yourself visible on the network.
   * Other peers can see this and connect to you.
   *
   * @param {Object} meta - Discovery metadata (e.g., { game: 'Chess' })
   * @param {Object} [options] - Broadcast options
   * @param {string} [options.amount='1'] - KAS amount for the transaction
   * @returns {Promise<Object>} Discovery anchor with txid
   *
   * @example
   * await kaspaPortal.broadcastDiscovery({ game: 'MyGame', version: '1.0' });
   */
  async broadcastDiscovery(meta, options = {}) {
    return await this.sessionManager.broadcastDiscovery(meta, options);
  }

  /**
   * Connect to a peer using their discovery anchor.
   * Establishes an encrypted session for messaging.
   *
   * @param {Object} discoveryAnchor - Peer's discovery anchor
   * @param {Object} [options] - Connection options
   * @returns {Promise<Object>} Session info with mailboxId
   *
   * @example
   * const session = await kaspaPortal.connectToPeer(peerDiscovery);
   * await kaspaPortal.sendMessage(session.mailboxId, 'Hello!');
   */
  async connectToPeer(discoveryAnchor, options = {}) {
    return await this.sessionManager.connectToPeer(discoveryAnchor, options);
  }

  /**
   * Send an encrypted message to a peer.
   *
   * @param {string} mailboxId - Session mailbox ID
   * @param {string} plaintext - Message content
   * @param {Object} [options] - Send options
   * @returns {Promise<Object>} Message result with txid
   */
  async sendMessage(mailboxId, plaintext, options = {}) {
    return await this.sessionManager.sendMessage(mailboxId, plaintext, options);
  }

  /**
   * Process an incoming KKTP payload from the blockchain.
   * Automatically routes to the correct session/lobby handler.
   *
   * @param {string} rawPayload - Raw KKTP payload string
   * @returns {Promise<Object>} Processing result
   */
  async processIncomingPayload(rawPayload) {
    return await this.sessionManager.processIncomingPayload(rawPayload);
  }

  // --- Session Query & Management ---

  /**
   * Get all active sessions.
   * @returns {Array} Array of session objects
   */
  getSessions() {
    return this.sessionManager.getSessions();
  }

  /**
   * Get a specific session by mailbox ID.
   * @param {string} mailboxId - Session mailbox ID
   * @returns {Object|null} Session or null
   */
  getSession(mailboxId) {
    return this.sessionManager.getSession(mailboxId);
  }

  /**
   * Close a session and mark it as ended.
   * @param {string} mailboxId - Session to close
   */
  closeSession(mailboxId) {
    return this.sessionManager.closeSession(mailboxId);
  }

  /**
   * Check if a session has expired based on its uptime.
   * @param {string} mailboxId - Session to check
   * @param {number} [nowMs=Date.now()] - Current timestamp
   * @returns {boolean}
   */
  isSessionExpired(mailboxId, nowMs = Date.now()) {
    return this.sessionManager.isSessionExpired(mailboxId, nowMs);
  }

  /**
   * Remove all expired sessions.
   * @param {number} [nowMs=Date.now()] - Current timestamp
   * @returns {number} Number of sessions pruned
   */
  pruneExpiredSessions(nowMs = Date.now()) {
    return this.sessionManager.pruneExpiredSessions(nowMs);
  }

  // --- Session Persistence ---

  /**
   * Export all sessions for backup or transfer.
   * @param {Object} [options] - Export options
   * @param {boolean} [options.includeMessages=true] - Include message history
   * @returns {Object} Session snapshot
   */
  exportSessions({ includeMessages = true } = {}) {
    return this.sessionManager.exportSessions({ includeMessages });
  }

  /**
   * Restore sessions from a snapshot.
   * @param {Object} snapshot - Previously exported snapshot
   * @param {Object} [options] - Restore options
   * @param {boolean} [options.skipExpired=true] - Skip expired sessions
   * @returns {Promise<number>} Number of sessions restored
   */
  async restoreSessions(snapshot, { skipExpired = true } = {}) {
    return await this.sessionManager.restoreSessions(snapshot, { skipExpired });
  }

  /**
   * Configure automatic session persistence.
   * @param {Object} options - Persistence options
   */
  configureResumePersistence(options = {}) {
    return this.sessionManager.configureResumePersistence(options);
  }

  /**
   * Force immediate persistence of all sessions.
   */
  forcePersistAllSessions() {
    return this.sessionManager.forcePersistAllSessions();
  }

  /**
   * Resume sessions from storage.
   * @param {Object} [options] - Resume options
   * @returns {Promise<Object>}
   */
  async resumeSession(options = {}) {
    return await this.sessionManager.resumeSession(options);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 14: LOBBY (LobbyFacade Proxy)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create and host a multiplayer lobby.
   * Your discovery anchor will advertise the lobby to other peers.
   *
   * @param {Object} options - Lobby options
   * @param {string} options.lobbyName - Display name for the lobby
   * @param {string} [options.gameName] - Game identifier
   * @param {number} [options.maxMembers=10] - Maximum lobby size
   * @returns {Promise<Object>} Lobby info
   *
   * @example
   * await kaspaPortal.hostLobby({
   *   lobbyName: 'Pro Players Only',
   *   gameName: 'Chess',
   *   maxMembers: 4
   * });
   */
  async hostLobby(options) {
    return await this.lobbyManager.hostLobby(options);
  }

  /**
   * Join an existing lobby.
   *
   * @param {Object} lobbyDiscovery - Host's discovery anchor
   * @param {string} [displayName] - Your display name in the lobby
   * @returns {Promise<Object>} Lobby info
   */
  async joinLobby(lobbyDiscovery, displayName) {
    return await this.lobbyManager.joinLobby(lobbyDiscovery, displayName);
  }

  /**
   * Leave the current lobby (as a member).
   * @param {string} [reason] - Optional reason
   * @returns {Promise<void>}
   */
  async leaveLobby(reason) {
    return await this.lobbyManager.leaveLobby(reason);
  }

  /**
   * Close the lobby (as the host).
   * Notifies all members and ends the lobby.
   * @param {string} [reason] - Optional reason
   * @returns {Promise<void>}
   */
  async closeLobby(reason) {
    return await this.lobbyManager.closeLobby(reason);
  }

  /**
   * Send a message to all lobby members.
   *
   * @param {string} plaintext - Message content
   * @returns {Promise<Object>} Send result
   */
  async sendGroupMessage(plaintext) {
    return await this.lobbyManager.sendGroupMessage(plaintext);
  }

  /**
   * Route a DM message through the lobby handler.
   * Checks if the message is lobby-related (join request, etc.).
   *
   * @param {string} mailboxId - DM mailbox ID
   * @param {string} plaintext - Message content
   * @returns {boolean} True if handled as lobby message
   */
  routeDMMessage(mailboxId, plaintext) {
    return this.lobbyManager.routeDMMessage(mailboxId, plaintext);
  }

  /**
   * Parse a raw payload to check if it's a group message.
   * @param {string} rawPayload - Raw KKTP payload
   * @returns {{isGroup: boolean, groupMailboxId?: string}}
   */
  parseGroupPayload(rawPayload) {
    return this.lobbyManager.parseGroupPayload(rawPayload);
  }

  /**
   * Process an incoming group message payload.
   * @param {string} rawPayload - Raw group message payload
   * @returns {Promise<Object>}
   */
  async processGroupPayload(rawPayload) {
    return await this.lobbyManager.processGroupPayload(rawPayload);
  }

  /**
   * Check if currently in a lobby.
   * @returns {boolean}
   */
  isInLobby() {
    return this.lobbyManager.isInLobby();
  }

  /**
   * Get current lobby information.
   * @returns {Object|null} Lobby info or null
   */
  get lobbyInfo() {
    return this.lobbyManager.lobbyInfo;
  }

  /**
   * Get list of lobby members.
   * @returns {Array} Member objects
   */
  get lobbyMembers() {
    return this.lobbyManager.members;
  }

  /**
   * Get lobby message history.
   * @returns {Array} Message objects
   */
  get lobbyMessages() {
    return this.lobbyManager.messageHistory;
  }

  /**
   * Check if you are the lobby host.
   * @returns {boolean}
   */
  get isLobbyHost() {
    return this.lobbyManager.isHost;
  }

  /**
   * Subscribe to member join events.
   * @param {Function} cb - Callback receiving member info
   * @returns {this} For chaining
   */
  onMemberJoin(cb) {
    this.lobbyManager.onMemberJoin(cb);
    return this;
  }

  /**
   * Subscribe to member leave events.
   * @param {Function} cb - Callback receiving member info
   * @returns {this} For chaining
   */
  onMemberLeave(cb) {
    this.lobbyManager.onMemberLeave(cb);
    return this;
  }

  /**
   * Subscribe to group message events.
   * @param {Function} cb - Callback receiving message
   * @returns {this} For chaining
   *
   * @example
   * kaspaPortal.onGroupMessage((msg) => {
   *   console.log(`${msg.senderName}: ${msg.plaintext}`);
   * });
   */
  onGroupMessage(cb) {
    this.lobbyManager.onGroupMessage(cb);
    return this;
  }

  /**
   * Subscribe to lobby close events.
   * @param {Function} cb - Callback receiving close reason
   * @returns {this} For chaining
   */
  onLobbyClose(cb) {
    this.lobbyManager.onLobbyClose(cb);
    return this;
  }
}

// Singleton instance
export const kaspaPortal = new KaspaPortal();
