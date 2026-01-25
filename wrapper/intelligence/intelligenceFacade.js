import {
  walkDagToPresent,
  scanDagForward,
  scanDagBackward,
} from "./dag_walk.js";
import { KaspaBlockScanner, SearchMode } from "./scanner.js";
import {
  IndexerEventType,
  MatchMode,
  EvictionReason,
  IndexerStore,
} from "./indexer.js";

// Re-export indexer enums
export {
  IndexerEventType,
  MatchMode,
  EvictionReason,
  IndexerStore,
  SearchMode,
};

export class IntelligenceFacade {
  /**
   * @param {Object} client - Kaspa RPC client
   * @param {Object} scannerOptions - { prefix, addresses, mode }
   * @param {Object} indexerOptions - { dbName, matchMode, onIndexerUpdate, ttlMinutes, etc. }
   */
  constructor(client, scannerOptions = {}, indexerOptions = {}) {
    this.client = client;
    this._callbacks = {};

    const onIndexerUpdate = (event) => {
      this._handleIndexerUpdate(event);
    };

    // The Scanner is the "Worker" - it creates and owns the Indexer
    // We pass the indexerOptions straight through as the scanner expects.
    this.scanner = new KaspaBlockScanner(client, {
      ...scannerOptions,
      indexerOptions: { ...indexerOptions, onIndexerUpdate },
    });

    // Expose the indexer for direct queries (getMetrics, getAllCachedBlocks, etc.)
    this.indexer = this.scanner.indexer;

    this._activeTasks = new AbortController();
  }

  _handleIndexerUpdate = (event) => {
    const { type, data } = event;

    switch (type) {
      case IndexerEventType.TRANSACTION_IN_MEMORY:
        this._trigger("onNewTransaction", data);
        break;
      case IndexerEventType.MATCHING_TRANSACTION_IN_MEMORY:
        this._trigger("onNewTransactionMatch", data);
        break;
      case IndexerEventType.BLOCK_IN_MEMORY:
        this._trigger("onNewBlock", data);
        break;
      case IndexerEventType.TRANSACTION_CACHED:
        this._trigger("onCachedTransaction", data);
        break;
      case IndexerEventType.MATCHING_TRANSACTION_CACHED:
        this._trigger("onCachedTransactionMatch", data);
        break;
      case IndexerEventType.BLOCK_CACHED:
        this._trigger("onCachedBlock", data);
        break;
      case IndexerEventType.FLUSH_COMPLETED:
        this._trigger("onFlushCompleted", data);
        break;
      case IndexerEventType.EVICT_CYCLE_COMPLETED:
        this._trigger("onEvictCycleCompleted", data);
        break;
      case IndexerEventType.EVICT:
        // Differentiate between cache evictions and full evictions
        if (
          data?.reason === EvictionReason.TTL ||
          data?.reason === EvictionReason.SIZE
        ) {
          this._trigger("onCacheEvict", data);
        } else {
          this._trigger("onEvict", data);
        }
        break;
      default:
        console.warn("IntelligenceFacade: Unknown event type:", type);
    }
  };

  _trigger(name, data) {
    if (typeof this._callbacks[name] === "function") {
      this._callbacks[name](data);
    }
  }

  onNewBlock(cb) {
    this._callbacks.onNewBlock = cb;
    return this;
  }
  onNewTransaction(cb) {
    this._callbacks.onNewTransaction = cb;
    return this;
  }
  onNewTransactionMatch(cb) {
    this._callbacks.onNewTransactionMatch = cb;
    return this;
  }
  onCachedBlock(cb) {
    this._callbacks.onCachedBlock = cb;
    return this;
  }
  onCachedTransaction(cb) {
    this._callbacks.onCachedTransaction = cb;
    return this;
  }
  onCachedTransactionMatch(cb) {
    this._callbacks.onCachedTransactionMatch = cb;
    return this;
  }
  onEvict(cb) {
    this._callbacks.onEvict = cb;
    return this;
  }
  onCacheEvict(cb) {
    this._callbacks.onCacheEvict = cb;
    return this;
  }

  async init() {
    await this.indexer.initDB();
  }

  /**
   * Starts the system.
   * The scanner will listen to the network, feed the indexer,
   * and the indexer will fire the 'onIndexerUpdate' events.
   */
  async start() {
    await this.indexer.initDB();
    this.indexer.start();

    // Start the scanner. We don't need a separate callback here because
    // the user is listening via the indexer's onIndexerUpdate events.
    await this.scanner.start();
  }

  getIndexerTimings() {
    return {
      ttlMs: this.indexer?.ttlMs ?? null,
      flushInterval: this.indexer?.flushInterval ?? null,
    };
  }

  async startIndexer() {
    await this.init();
    this.indexer.start();
    return this.getIndexerTimings();
  }

  stopIndexer() {
    this.indexer.stop();
  }

  setSearchMode(mode) {
    if (this.scanner) this.scanner.searchMode = mode;
  }

  async startScanner(onBlock) {
    return this.scanner.start(onBlock);
  }

  stopScanner() {
    this.scanner.stop();
  }

  async getCachedSnapshot() {
    const [allTxs, matchingTxs, blocks] = await Promise.all([
      this.indexer.getAllCachedTransactions(),
      this.indexer.getAllCachedMatchingTransactions(),
      this.indexer.getAllCachedBlocks(),
    ]);
    return { allTxs, matchingTxs, blocks };
  }

  getInMemorySnapshot() {
    return {
      allTxs: this.indexer.getAllTransactions(),
      matchingTxs: this.indexer.getAllMatchingTransactions(),
      blocks: this.indexer.getAllBlocks(),
    };
  }

  async clearIndexerStore(storeName) {
    return this.indexer.clearStore(storeName);
  }

  /**
   * Synchronizes the indexer from a specific block hash to the present.
   * @param {string} startHash - The starting block hash.
   * @param {function} logFn - Optional logging function.
   * @param {Object} options - { maxSeconds, minTimestamp }
   * @returns {Promise<void>}
   */
  async syncFrom(
    startHash,
    logFn = null,
    { maxSeconds = 30, minTimestamp = 0 } = {},
  ) {
    return walkDagToPresent({
      client: this.client,
      startHash,
      logFn,
      maxSeconds,
      minTimestamp,
      onBlock: (block) => {
        this.indexer.addBlock(block);
        return false;
      },
    });
  }

  /**
   * Scan forward from a specific block to find payloads matching criteria.
   * @param {string} startHash - The starting block hash.
   * @param {string} searchText - Text to search for in payloads.
   * @param {string} mode - Match mode: contains, startsWith, exact, endsWith.
   * @param {Object} options - { maxSeconds, minTimestamp, logFn }
   * @returns {Array} Array of { block, tx } matches.
   */
  async findPayload(
    startHash,
    searchText,
    mode = "contains",
    { maxSeconds = 30, minTimestamp = 0, logFn = null } = {},
  ) {
    return scanDagForward({
      client: this.client,
      startHash,
      searchText,
      matchMode: mode,
      maxSeconds,
      minTimestamp,
      logFn,
    });
  }

  /**
   * Historical scan backwards from a specific block.
   * @param {string} startHash - The starting block hash.
   * @param {function} matchFn - Function(block, tx) that returns true for matches.
   * @param {Object} options - { maxSeconds, maxDepth, logFn }
   * @returns {Array} Array of { block, tx } matches.
   */
  async findHistorical(
    startHash,
    matchFn,
    { maxSeconds = 30, maxDepth = Infinity, logFn = null } = {},
  ) {
    return scanDagBackward({
      client: this.client,
      startHash,
      matchFn,
      maxSeconds,
      maxDepth,
      logFn,
    });
  }

  /**
   * Add an address to the watch list
   * @param {string} address - Kaspa address to watch
   */
  addAddress(address) {
    this.scanner?.addAddress(address);
  }

  /** Remove an address from the watch list
   * @param {string} address - Kaspa address to remove
   */
  removeAddress(address) {
    this.scanner?.removeAddress(address);
  }

  /** Set the list of addresses to watch
   * @param {Array<string>|string} addresses - Array of addresses or single address
   */
  setAddresses(addresses) {
    if (!this.scanner) return;
    // Remove all current addresses
    if (Array.isArray(this.scanner.addresses)) {
      for (const addr of [...this.scanner.addresses]) {
        this.scanner.removeAddress(addr);
      }
    }
    // Add new addresses
    const addrs = Array.isArray(addresses) ? addresses : [addresses];
    for (const addr of addrs) {
      this.scanner.addAddress(addr);
    }
  }

  /** Add a payload prefix to the watch list
   * @param {string} prefix - Payload prefix to add
   */
  addPrefix(prefix) {
    this.scanner?.addPrefix(prefix);
  }

  /** Remove a payload prefix from the watch list
   * @param {string} prefix - Payload prefix to remove
   */
  removePrefix(prefix) {
    this.scanner?.removePrefix(prefix);
  }

  /** Set the list of payload prefixes to watch
   * @param {Array<string>|string} prefixes - Array of prefixes or single prefix
   */
  setPrefixes(prefixes) {
    if (!this.scanner) return;
    // Remove all current prefixes
    if (Array.isArray(this.scanner.prefixes)) {
      for (const prefix of [...this.scanner.prefixes]) {
        this.scanner.removePrefix(prefix);
      }
    }
    // Add new prefixes
    const pfxs = Array.isArray(prefixes) ? prefixes : [prefixes];
    for (const prefix of pfxs) {
      this.scanner.addPrefix(prefix);
    }
  }

  shutdown() {
    this._activeTasks.abort();
    this.scanner.stop();
    this.indexer.stop();
  }
}
