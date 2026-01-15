// indexer.js - Kaspa Transaction Indexer (browser version)

/** Enum for KaspaIndexer match modes.
 * @readonly
 * @enum {string}
 */
export const MatchMode = Object.freeze({
  ALL: "all",              // index everything
  TRANSACTIONS: "transactions", // index all transactions only
  MATCHING: "matching",    // index only matching transactions
  BLOCKS: "blocks",        // index only blocks
  CUSTOM: "custom"         // fine-grained booleans for mixed combos
});

/**
 * Enum for eviction reasons.
 * @readonly
 * @enum {string}
 */
export const EvictionReason = Object.freeze({
  TTL: "ttl",
  SIZE: "size"
});

/**
 * Enum for KaspaIndexer object store names.
 * @readonly
 * @enum {string}
 */
export const IndexerStore = Object.freeze({
  TRANSACTIONS: "transactions", // all transactions
  MATCHING_TRANSACTIONS: "matching_transactions", // matching txs only
  BLOCKS: "blocks" // all blocks
});

/**
 * Generic Kaspa Transaction Indexer using IndexedDB for storage and in-memory cache for deduplication.
 */
export class KaspaIndexer {
  // Metrics for observability
  _metrics = {
    transactionsIndexed: 0,
    blocksIndexed: 0,
    evictions: {
      ttl: 0,
      size: 0
    },
    cacheHits: 0,
    cacheMisses: 0
  };
  // In-memory rolling cache for deduplication (Set for O(1) lookup, Array for FIFO eviction)
  _txidCacheSet = new Set();
  _txidCacheQueue = [];
  _txidCacheMax = 1000;

  /**
   * Create a KaspaIndexer instance.
   * @param {Object} options - Indexer options.
   * @param {number|null} [options.ttlMinutes=null] - Time-to-live in minutes for indexed items (null = no TTL).
   * @param {number|null} [options.maxSize=null] - Maximum number of items to store (null = no size limit).
   * @param {boolean} [options.priorityTTL=true] - If true, TTL eviction is prioritized over size eviction.
   * @param {string} [options.dbName="kaspaIndexer"] - Name of the IndexedDB database.
   * @param {boolean} [options.indexAllTransactions=true] - If true, index all transactions.
   * @param {boolean} [options.indexAllMatchingTransactions=true] - If true, index all matching transactions.
   * @param {boolean} [options.indexAllBlocks=false] - If true, index all blocks.
   * @param {function|null} [options.onEvict=null] - Callback function when an item is evicted.
   * @param {function|null} [options.onTransaction=null] - Callback function when a matching transaction is indexed.
   */
  constructor({
    ttlMinutes = null,
    maxSize = null,
    priorityTTL = true,
    dbName = "kaspaIndexer",
    matchMode = MatchMode.ALL,
    indexAllTransactions = true,
    indexAllMatchingTransactions = true,
    indexAllBlocks = false,
    onEvict = null,
    onTransaction = null
  } = {}) {
    this.active = false;
    this.ttlMs = ttlMinutes ? ttlMinutes * 60 * 1000 : null;
    this.maxSize = maxSize;
    this.priorityTTL = priorityTTL;
    this.dbName = dbName;
    this.db = null;
    this._evictionInterval = null;
    this.onEvict = typeof onEvict === 'function' ? onEvict : null;
    this.onTransaction = typeof onTransaction === 'function' ? onTransaction : null;

    this.matchMode = matchMode;
    // Only used if matchMode === CUSTOM
    this.indexAllTransactions = indexAllTransactions;
    this.indexAllMatchingTransactions = indexAllMatchingTransactions;
    this.indexAllBlocks = indexAllBlocks;

    // Promise that resolves when DB is ready
    this._dbReady = new Promise((resolve) => {
      this._resolveDbReady = resolve;
    });
  }

  /** 
   * Initialize the IndexedDB database and object stores.
   * @returns {Promise<IDBDatabase>}
   */
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IndexerStore.MATCHING_TRANSACTIONS)) {
          const store = db.createObjectStore(IndexerStore.MATCHING_TRANSACTIONS, { keyPath: "txid" });
          store.createIndex("timestamp", "timestamp");
        }
        if (!db.objectStoreNames.contains(IndexerStore.TRANSACTIONS)) {
          const txStore = db.createObjectStore(IndexerStore.TRANSACTIONS, { keyPath: "txid" });
          txStore.createIndex("timestamp", "timestamp");
        }
        if (!db.objectStoreNames.contains(IndexerStore.BLOCKS)) {
          const blockStore = db.createObjectStore(IndexerStore.BLOCKS, { keyPath: "hash" });
          blockStore.createIndex("timestamp", "timestamp");
        }
      };
      request.onsuccess = async (e) => {
        this.db = e.target.result;
        // Preload txids from both stores into in-memory cache (cold start dedupe)
        await this._preloadTxidCache();
        if (this._resolveDbReady) this._resolveDbReady();
        resolve(this.db);
      };
      request.onerror = (e) => reject(e);
    });
  }

  /** 
   * Start the eviction timer based on ttlMs. 
   */
  startEvictionTimer() {
    if (this._evictionInterval) clearInterval(this._evictionInterval);
    // Use ttlMs for eviction interval, fallback to 600000ms if not set
    const interval = this.ttlMs && this.ttlMs > 0 ? this.ttlMs : 600000;
    this._evictionInterval = setInterval(() => {
      this.evict();
    }, interval);
  }

  /** 
   * Start the indexer
   */
  start () {
    this.active = true;
    this.startEvictionTimer();
  }
  /** 
   * Stop the eviction timer.
   */
  stopEvictionTimer() {
    if (this._evictionInterval) {
      clearInterval(this._evictionInterval);
      this._evictionInterval = null;
    }
  }

  /** 
   * Stop the indexer
   */
  stop () {
    this.active = false;
    this.stopEvictionTimer();
  }

  /**
   * Add a transaction to the indexer (matching or non-matching). Only unique txs (by txid) are indexed.
   * @param {Object} tx - The transaction object.
   * @param {boolean} [isMatch=true] - If true, store as a matching transaction; if false, store as a non-matching transaction.
   */
  async addTransaction(tx, isMatch = true) {
    await this._dbReady;
    // Respect matchMode
    if (this.matchMode === MatchMode.BLOCKS) return;
    if (this.matchMode === MatchMode.MATCHING && !isMatch) return;
    if (this.matchMode === MatchMode.TRANSACTIONS && isMatch) return;
    if (this.matchMode === MatchMode.CUSTOM) {
      if (!this.indexAllTransactions && !this.indexAllMatchingTransactions) return;
      if (!this.indexAllTransactions && !isMatch) return;
      if (!this.indexAllMatchingTransactions && isMatch) return;
    }
    const now = Number(tx.timestamp.toString());
    const txid = tx.txid;
    if (!txid) {
      this._metrics.cacheMisses++;
      return;
    }
    // In-memory deduplication only
    if (this._txidCacheSet.has(txid)) {
      this._metrics.cacheHits++;
      return;
    }
    const storeName = isMatch ? IndexerStore.MATCHING_TRANSACTIONS : IndexerStore.TRANSACTIONS;
    const entry = { ...tx, timestamp: now };
    const txReq = this.db.transaction(storeName, "readwrite");
    const req = txReq.objectStore(storeName).put(entry);
    req.onerror = (e) => {
      console.error("IndexedDB put failed (addTransaction):", e.target.error);
    };
    // Update in-memory cache (Set + Queue for rolling window)
    this._txidCacheSet.add(txid);
    this._txidCacheQueue.push(txid);
    if (this._txidCacheQueue.length > this._txidCacheMax) {
      const oldest = this._txidCacheQueue.shift();
      this._txidCacheSet.delete(oldest);
    }
    this._metrics.transactionsIndexed++;
    if (isMatch && typeof this.onTransaction === 'function') {
      this.onTransaction({ match: entry });
    }
  }

  /**
   * Batch add transactions (deduplicated in-memory, single DB transaction)
   * @param {Array<Object>} txs - Array of transaction objects
   * @param {boolean} [isMatch=true] - Store as matching or non-matching
   */
  async addTransactionsBatch(txs, isMatch = true) {
    await this._dbReady;
    const storeName = isMatch ? IndexerStore.MATCHING_TRANSACTIONS : IndexerStore.TRANSACTIONS;
    const txReq = this.db.transaction(storeName, "readwrite");
    const store = txReq.objectStore(storeName);
    for (const tx of txs) {
      const now = Number(tx.timestamp.toString());
      const txid = tx.txid;
      if (!txid) {
        this._metrics.cacheMisses++;
        continue;
      }
      // In-memory deduplication only
      if (this._txidCacheSet.has(txid)) {
        this._metrics.cacheHits++;
        continue;
      }
      const entry = { ...tx, timestamp: now };
      const req = store.put(entry);
      req.onerror = (e) => {
        console.error("IndexedDB put failed (addTransactionsBatch):", e.target.error);
      };
      this._txidCacheSet.add(txid);
      this._txidCacheQueue.push(txid);
      if (this._txidCacheQueue.length > this._txidCacheMax) {
        const oldest = this._txidCacheQueue.shift();
        this._txidCacheSet.delete(oldest);
      }
      this._metrics.transactionsIndexed++;
      if (isMatch && typeof this.onTransaction === 'function') {
        this.onTransaction({ match: entry });
      }

        // Immediately evict if needed after each insert
        await this.evict();
    }
  }

  /**
   * Add a block to the indexer (for BLOCKS store only).
   * @param {Object} block - The block object.
   */
  async addBlock(block) {
    await this._dbReady;
    // Respect matchMode
    if (
      this.matchMode === MatchMode.ALL ||
      this.matchMode === MatchMode.BLOCKS ||
      (this.matchMode === MatchMode.CUSTOM && this.indexAllBlocks)
    ) {
      const now = Number(block.header.timestamp.toString());
      const hash = block.header?.hash || block.hash;
      if (!hash) {
        console.error('Block has no hash, cannot index.', block);
        return;
      }
      const blockEntry = { ...block, timestamp: now, hash };
      const blockReq = this.db.transaction(IndexerStore.BLOCKS, "readwrite");
      const req = blockReq.objectStore(IndexerStore.BLOCKS).put(blockEntry);
      req.onerror = (e) => {
        console.error("IndexedDB put failed (addBlock):", e.target.error);
      };
      this._metrics.blocksIndexed++;
    }
  }

  /**
   * Evict old entries from the indexer based on TTL and size constraints.
   */
  async evict() {
    await this._dbReady;
    const now = Date.now();
    const stdOnEvict = (storeName) => (evictInfo) => {
      if (this.onEvict) this.onEvict({ key: evictInfo.key, reason: evictInfo.reason, storeName });
    };

    if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.MATCHING) {
      this._evictStore(IndexerStore.MATCHING_TRANSACTIONS, "txid", stdOnEvict(IndexerStore.MATCHING_TRANSACTIONS), now);
    }
    if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.TRANSACTIONS) {
      this._evictStore(IndexerStore.TRANSACTIONS, "txid", stdOnEvict(IndexerStore.TRANSACTIONS), now);
    }
    if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.BLOCKS) {
      this._evictStore(IndexerStore.BLOCKS, "hash", stdOnEvict(IndexerStore.BLOCKS), now);
    }
    if (this.matchMode === MatchMode.CUSTOM) {
      if (this.indexAllMatchingTransactions) {
        this._evictStore(IndexerStore.MATCHING_TRANSACTIONS, "txid", stdOnEvict(IndexerStore.MATCHING_TRANSACTIONS), now);
      }
      if (this.indexAllTransactions) {
        this._evictStore(IndexerStore.TRANSACTIONS, "txid", stdOnEvict(IndexerStore.TRANSACTIONS), now);
      }
      if (this.indexAllBlocks) {
        this._evictStore(IndexerStore.BLOCKS, "hash", stdOnEvict(IndexerStore.BLOCKS), now);
      }
    }
  }

  /**
   * Clear all entries from a specific object store.
   * @param {string} storeName - The name of the store (use IndexerStore constant).
   * @returns {Promise<void>}
   */
  async clearStore(storeName) {
    await this._dbReady;

    // Validation: ensure storeName is one of the known constants
    if (!Object.values(IndexerStore).includes(storeName)) {
      throw new Error(`Invalid storeName: ${storeName}`);
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.clear();

        // Transaction-level completion handling
        tx.oncomplete = () => {
          // Metrics / observability
          if (this._metrics) {
            this._metrics.storesCleared = (this._metrics.storesCleared || 0) + 1;
            this._metrics.clearsByStore = this._metrics.clearsByStore || {};
            this._metrics.clearsByStore[storeName] =
              (this._metrics.clearsByStore[storeName] || 0) + 1;
          }
          resolve();
        };

        tx.onerror = (e) => {
          console.error(`IndexedDB clear failed for store ${storeName}:`, e.target.error);
          reject(e.target.error);
        };
        tx.onabort = (e) => {
          console.error(`IndexedDB transaction aborted for store ${storeName}:`, e.target.error);
          reject(e.target.error);
        };
      } catch (err) {
        console.error(`IndexedDB clear failed for store ${storeName}:`, err);
        reject(err);
      }
    });
  }

  /**
   * Get a snapshot of current metrics.
   * @returns {Object}
   */
  getMetrics() {
    return { ...this._metrics, evictions: { ...this._metrics.evictions } };
  }

  /**
   * Print metrics to the console in a table format.
   */
  reportMetrics() {
    console.table({
      transactionsIndexed: this._metrics.transactionsIndexed,
      blocksIndexed: this._metrics.blocksIndexed,
      evictions_ttl: this._metrics.evictions.ttl,
      evictions_size: this._metrics.evictions.size,
      cacheHits: this._metrics.cacheHits,
      cacheMisses: this._metrics.cacheMisses
    });
  }

  /**
   * Get a transaction by its txid.
   * @param {string} txid - The transaction ID.
   * @returns {Promise<Object|null>} - The matching transaction or null.
   */
  async getTransaction(txid) {
    return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, txs => txs.find(tx => tx.txid === txid) || null);
  }

  /**
   * Get all matching indexed transactions.
   * @returns {Promise<Object[]>} - Array of all transactions.
   */
  async getAllMatchingTransactions() {
    return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, txs => txs);
  }

  /**
   * Get all indexed transactions.
   * @returns {Promise<Object[]>} - Array of all blocks.
   */
  async getAllTransactions() {
    return this._queryStore(IndexerStore.TRANSACTIONS, txs => txs);
  }

  /**
   * Get all indexed blocks.
   * @returns {Promise<Object[]>} - Array of all blocks.
   */
  async getAllBlocks() {
    return this._queryStore(IndexerStore.BLOCKS, blocks => blocks);
  }

  /**
   * Get the most recent transaction matching the given criteria.
   * @param {string} sender - Sender address.
   * @param {string} receiver - Receiver address.
   * @param {number} blockDaaScore - Block DAA score.
   * @param {bigint} amount - Amount transferred.
   * @returns {Promise<Object|null>} - The most recent matching transaction or null.
   */
  async getMostRecentTransaction(sender, receiver, blockDaaScore, amount) {
    return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, txs => {
      const matches = txs
        .filter(tx =>
          tx.sender === sender &&
          tx.receiver === receiver &&
          tx.blockDaaScore === blockDaaScore &&
          tx.amount === amount
        )
        .sort((a, b) => b.timestamp - a.timestamp);
      return matches[0] || null;
    });
  }

  /**
   * Get transactions with a Block DAA score greater than the specified minimum.
   * @param {number} minBlockDaaScore - The minimum Block DAA score.
   * @returns {Promise<Object[]>} - Array of matching transactions.
   */
  async getTransactionsAfterBlockDaaScore(minBlockDaaScore) {
    return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, txs =>
      txs.filter(tx => tx.blockDaaScore > minBlockDaaScore)
    );
  }

  /**
   * Get transactions for a specific address, optionally within a recent time frame.
   * @param {string} address - The address to query.
   * @param {number|null} [recentSeconds=null] - If provided, only transactions within this many seconds from now are returned.
   * @returns {Promise<Object[]>} - Array of matching transactions.
   */
  async getTransactionsForAddress(address, recentSeconds = null) {
    const now = Date.now();
    return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, txs => {
      let matches = txs.filter(tx =>
        tx.sender === address || tx.receiver === address
      );
      if (recentSeconds) {
        const cutoff = now - (recentSeconds * 1000);
        matches = matches.filter(tx => tx.timestamp >= cutoff);
      }
      return matches.sort((a, b) => b.timestamp - a.timestamp);
    });
  }

  /**
   * (Internal) Preload all txids from both transaction stores into the in-memory cache (cold start dedupe)
   */
  async _preloadTxidCache() {
    const preloadStore = async (storeName) => {
      return new Promise((resolve) => {
        try {
          const txReq = this.db.transaction(storeName, "readonly");
          const store = txReq.objectStore(storeName);
          const req = store.getAllKeys();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch (err) {
          // If the store does not exist (first run or upgrade), just resolve empty
          if (err.name === "NotFoundError") {
            resolve([]);
          } else {
            console.error(`Error preloading store ${storeName}:`, err);
            resolve([]);
          }
        }
      });
    };
    const allTxids = await preloadStore(IndexerStore.TRANSACTIONS);
    const recentTxids = allTxids.slice(-this._txidCacheMax);
    this._txidCacheSet = new Set(recentTxids);
    this._txidCacheQueue = [...recentTxids];
  }

  /**
   * (Internal) Generic helper to query any object store.
   * @param {string} storeName - The name of the object store.
   * @param {function(Object[]): any} processFn - Function to process the full result set.
   * @returns {Promise<any>}
   */
  async _queryStore(storeName, processFn) {
    return new Promise((resolve) => {
      const txReq = this.db.transaction(storeName, "readonly");
      const store = txReq.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = processFn(req.result || []);
        resolve(result);
      };
    });
  }

  /** 
   * (Internal) Helper to evict from a given store, enforcing eviction priority. 
   */
  _evictStore(storeName, keyField, onEvict, now) {
    const txReq = this.db.transaction(storeName, "readwrite");
    const store = txReq.objectStore(storeName);

    if (this.priorityTTL) {
      if (this.ttlMs) this._evictByTTL(store, keyField, now, this.ttlMs, onEvict);
      if (this.maxSize) this._evictBySize(store, keyField, this.maxSize, onEvict);
    } else {
      if (this.maxSize) this._evictBySize(store, keyField, this.maxSize, onEvict);
      if (this.ttlMs) this._evictByTTL(store, keyField, now, this.ttlMs, onEvict);
    }

      // Helper to remove from in-memory cache
      const removeFromCache = (key) => {
        if (this._txidCacheSet.has(key)) {
          this._txidCacheSet.delete(key);
          const idx = this._txidCacheQueue.indexOf(key);
          if (idx !== -1) this._txidCacheQueue.splice(idx, 1);
        }
      };

      // Wrap onEvict to also remove from in-memory cache
      const onEvictAndRemove = (evictInfo) => {
        removeFromCache(evictInfo.key);
        if (onEvict) onEvict(evictInfo);
      };

      if (this.priorityTTL) {
        if (this.ttlMs) this._evictByTTL(store, keyField, now, this.ttlMs, onEvictAndRemove);
        if (this.maxSize) this._evictBySize(store, keyField, this.maxSize, onEvictAndRemove);
      } else {
        if (this.maxSize) this._evictBySize(store, keyField, this.maxSize, onEvictAndRemove);
        if (this.ttlMs) this._evictByTTL(store, keyField, now, this.ttlMs, onEvictAndRemove);
      }
  }

  /** 
   * (Internal) Evict items from a store by TTL. 
   */
  _evictByTTL(store, keyField, now, ttlMs, onEvict) {
    const cutoff = now - ttlMs;
    const index = store.index("timestamp");
    const range = IDBKeyRange.upperBound(cutoff);
    const req = index.openCursor(range);
    req.onerror = (e) => {
      console.error("IndexedDB openCursor failed (TTL eviction):", e.target.error);
    };
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const entry = cursor.value;
        if (entry.timestamp <= cutoff) {
          const delReq = store.delete(cursor.primaryKey);
          delReq.onerror = (err) => {
            console.error("IndexedDB delete failed (TTL eviction):", err.target.error);
          };
          if (onEvict) onEvict({ key: cursor.primaryKey, reason: EvictionReason.TTL });
          this._metrics.evictions.ttl++;
        }
        cursor.continue();
      }
    };
  }

  /** 
   * (Internal) Evict items from a store by max size. 
   */
  _evictBySize(store, keyField, maxSize, onEvict) {
    const countReq = store.count();
    countReq.onerror = (e) => {
      console.error("IndexedDB count failed (Size eviction):", e.target.error);
    };
    countReq.onsuccess = (e) => {
      const total = e.target.result;
      if (total > maxSize) {
        const excess = total - maxSize;
        const index = store.index("timestamp");
        const cursorReq = index.openCursor();
        let deleted = 0;
        cursorReq.onerror = (err) => {
          console.error("IndexedDB openCursor failed (Size eviction):", err.target.error);
        };
        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
          if (cursor && deleted < excess) {
            const delReq = store.delete(cursor.primaryKey);
            delReq.onerror = (err) => {
              console.error("IndexedDB delete failed (Size eviction):", err.target.error);
            };
            if (onEvict) onEvict({ key: cursor.primaryKey, reason: EvictionReason.SIZE });
            this._metrics.evictions.size++;
            deleted++;
            cursor.continue();
          }
        };
      }
    };
  }
}