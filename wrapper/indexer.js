// indexer.js - Kaspa Transaction Indexer (browser version)

export const IndexerEventType = Object.freeze({
  TRANSACTION_IN_MEMORY: 'transaction-in-memory',
  MATCHING_TRANSACTION_IN_MEMORY: 'matching-transaction-in-memory',
  BLOCK_IN_MEMORY: 'block-in-memory',
  TRANSACTION_CACHED: 'transaction-cached',
  MATCHING_TRANSACTION_CACHED: 'matching-transaction-cached',
  BLOCK_CACHED: 'block-cached',
  EVICT: 'evict'
});

export const MatchMode = Object.freeze({
  ALL: "all",
  TRANSACTIONS: "transactions",
  MATCHING: "matching",
  BLOCKS: "blocks",
  CUSTOM: "custom"
});

export const EvictionReason = Object.freeze({
  TTL: "ttl",
  SIZE: "size",
  IN_MEMORY_TRANSACTION: "in_memory_transaction",
  IN_MEMORY_BLOCK: "in_memory_block"
});

export const IndexerStore = Object.freeze({
  TRANSACTIONS: "transactions",
  MATCHING_TRANSACTIONS: "matching_transactions",
  BLOCKS: "blocks"
});

/** KaspaIndexer class for indexing transactions and blocks in the browser using IndexedDB.
 */
export class KaspaIndexer {
  // Metrics for observability
  _metrics = {
    transactionsIndexed: 0,
    blocksIndexed: 0,
    evictions: { ttl: 0, size: 0 },
    cacheHits: 0,
    cacheMisses: 0
  };

  // In-memory rolling cache for deduplication
  _txidCacheSet = new Set();
  _txidCacheQueue = [];
  _txidCacheMax = 1000;

  // In-memory buffers for batch flush
  _pendingTxs = [];
  _pendingBlocks = [];
  _inMemoryMaxTxs = 1000; // max in-memory txs/blocks before deduplication kicks in
  _inMemoryMaxBlocks = 1000;
  _flushInterval = 5000; // ms
  _flushTimer = null;

  constructor({
    ttlMinutes = null,
    flushInterval = 5000,
    maxSize = null,
    batchThresholdRatio = 0.10,
    priorityTTL = true,
    inMemoryMaxTxs = 1000,
    inMemoryMaxBlocks = 1000,
    dbName = "kaspaIndexer",
    matchMode = MatchMode.ALL,
    indexAllTransactions = true,
    indexAllMatchingTransactions = true,
    indexAllBlocks = false,
    onIndexerUpdate = null
  } = {}) {
    this.active = false;
    this.ttlMs = ttlMinutes ? ttlMinutes * 60 * 1000 : null;
    this._flushInterval = flushInterval;
    this.maxSize = maxSize;
    this.batchThresholdRatio = batchThresholdRatio;
    this.priorityTTL = priorityTTL;
    this.dbName = dbName;
    this.db = null;
    this._evictionInterval = null;
    this.onIndexerUpdate = typeof onIndexerUpdate === 'function' ? onIndexerUpdate : null;
    this.matchMode = matchMode;
    this.indexAllTransactions = indexAllTransactions;
    this.indexAllMatchingTransactions = indexAllMatchingTransactions;
    this.indexAllBlocks = indexAllBlocks;
    this._inMemoryMaxTxs = inMemoryMaxTxs;
    this._inMemoryMaxBlocks = inMemoryMaxBlocks;
    this._dbReady = new Promise((resolve) => {
      this._resolveDbReady = resolve;
    });
  }

  get flushInterval() {
    return this._flushInterval;
  }

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
        await this._preloadTxidCache();
        if (this._resolveDbReady) this._resolveDbReady();
        resolve(this.db);
      };
      request.onerror = (e) => reject(e);
    });
  }

  start() {
    this.active = true;
    this._startEvictionTimer();
    this._startFlushTimer();
  }

  stop() {
    this.active = false;
    this._stopEvictionTimer();
    this._stopFlushTimer();
    this.flush(); // flush any remaining data
  }

/* Indexing methods */

  /**
   * Add a transaction to the indexer.
   * @param {Object} tx - The transaction object to index.
   * @param {boolean} isMatch - Whether this transaction is a matching transaction.
   * @returns {Promise<void>}
   */
  async addTransaction(tx, isMatch = true) {
    // Respect matchMode
    if (this.matchMode === MatchMode.BLOCKS) return;
    if (this.matchMode === MatchMode.MATCHING && !isMatch) return;
    if (this.matchMode === MatchMode.TRANSACTIONS && isMatch) return;
    if (this.matchMode === MatchMode.CUSTOM) {
      if (!this.indexAllTransactions && !this.indexAllMatchingTransactions) return;
      if (!this.indexAllTransactions && !isMatch) return;
      if (!this.indexAllMatchingTransactions && isMatch) return;
    }
    const now = Number(tx.timestamp);
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
    // Buffer in memory
    this._txidCacheSet.add(txid);
    this._txidCacheQueue.push(txid);
    if (this._txidCacheQueue.length > this._txidCacheMax) {
      const oldest = this._txidCacheQueue.shift();
      this._txidCacheSet.delete(oldest);
    }
    const entry = { ...tx, timestamp: now };
    this._pendingTxs.push({ entry, isMatch });

    // Notify for all transactions added in-memory, respecting matchMode and indexAll* flags
    if (typeof this.onIndexerUpdate === 'function') {
      // Only emit if user wants all transactions in memory
      if (
        this.matchMode === MatchMode.ALL ||
        this.matchMode === MatchMode.TRANSACTIONS ||
        (this.matchMode === MatchMode.CUSTOM && this.indexAllTransactions)
      ) {
        this.onIndexerUpdate({ type: IndexerEventType.TRANSACTION_IN_MEMORY, data: entry });
      }
      // Only emit if user wants matching transactions in memory
      if (
        (isMatch && (
          this.matchMode === MatchMode.ALL ||
          this.matchMode === MatchMode.MATCHING ||
          (this.matchMode === MatchMode.CUSTOM && this.indexAllMatchingTransactions)
        ))
      ) {
        this.onIndexerUpdate({ type: IndexerEventType.MATCHING_TRANSACTION_IN_MEMORY, data: entry });
      }
    }

    this._metrics.transactionsIndexed++;

    // Flush if buffer is full
    if (this._pendingTxs.length >= this._inMemoryMaxTxs) {
      await this.flush();
    }
  }

  /**
   * Add a batch of transactions to the indexer.
   * @param {Object[]} txs - Array of transaction objects to index.
   * @param {boolean} isMatch - Whether these transactions are matching transactions.
   * @returns {Promise<void>}
   */
  async addTransactionsBatch(txs, isMatch = true) {
    // Buffer all txs in memory, then flush
    for (const tx of txs) {
      await this.addTransaction(tx, isMatch);
    }
  }

  /**
   * Add a block to the indexer.
   * @param {Object} block - The block object to index.
   * @returns {Promise<void>}
   */
  async addBlock(block) {
    // Respect matchMode
    if (
      this.matchMode === MatchMode.ALL ||
      this.matchMode === MatchMode.BLOCKS ||
      (this.matchMode === MatchMode.CUSTOM && this.indexAllBlocks)
    ) {
      const now = Number(block.header?.timestamp ?? block.timestamp);
      const hash = block.header?.hash || block.hash;
      if (!hash) {
        console.error('Block has no hash, cannot index.', block);
        return;
      }
      const blockEntry = { ...block, timestamp: now, hash };
      this._pendingBlocks.push(blockEntry);
      this._metrics.blocksIndexed++;

      // Only emit if user wants blocks in memory
      if (typeof this.onIndexerUpdate === 'function') {
        if (
          this.matchMode === MatchMode.ALL ||
          this.matchMode === MatchMode.BLOCKS ||
          (this.matchMode === MatchMode.CUSTOM && this.indexAllBlocks)
        ) {
          this.onIndexerUpdate({ type: IndexerEventType.BLOCK_IN_MEMORY, data: blockEntry });
        }
      }
      // Flush if buffer is full
      if (this._pendingBlocks.length >= this._inMemoryMaxBlocks) {
        await this.flush();
      }
    }
  }

  /**
   * Flush pending transactions and blocks to IndexedDB.
   * @returns {Promise<void>}
   */
  async flush() {
    await this._dbReady;
    // Batch flush transactions
    if (this._pendingTxs.length) {
      const txReqMatching = this.db.transaction(IndexerStore.MATCHING_TRANSACTIONS, "readwrite");
      const storeMatching = txReqMatching.objectStore(IndexerStore.MATCHING_TRANSACTIONS);
      const txReqAll = this.db.transaction(IndexerStore.TRANSACTIONS, "readwrite");
      const storeAll = txReqAll.objectStore(IndexerStore.TRANSACTIONS);

      for (const { entry, isMatch } of this._pendingTxs) {
        if (isMatch) {
          storeMatching.put(entry);
        } else {
          storeAll.put(entry);
        }
        // Notify for all transactions flushed to IndexedDB, respecting matchMode and indexAll* flags
        if (typeof this.onIndexerUpdate === 'function') {
          if (
            this.matchMode === MatchMode.ALL ||
            this.matchMode === MatchMode.TRANSACTIONS ||
            (this.matchMode === MatchMode.CUSTOM && this.indexAllTransactions)
          ) {
            this.onIndexerUpdate({ type: IndexerEventType.TRANSACTION_CACHED, data: entry });
          }
          if (
            isMatch && (
              this.matchMode === MatchMode.ALL ||
              this.matchMode === MatchMode.MATCHING ||
              (this.matchMode === MatchMode.CUSTOM && this.indexAllMatchingTransactions)
            )
          ) {
            this.onIndexerUpdate({ type: IndexerEventType.MATCHING_TRANSACTION_CACHED, data: entry });
          }
        }
      }
      this._pendingTxs = [];
    }
    // Batch flush blocks
    if (this._pendingBlocks.length) {
      const blockReq = this.db.transaction(IndexerStore.BLOCKS, "readwrite");
      const store = blockReq.objectStore(IndexerStore.BLOCKS);
      for (const blockEntry of this._pendingBlocks) {
        store.put(blockEntry);
        // Only emit if user wants blocks cached
        if (typeof this.onIndexerUpdate === 'function') {
          if (
            this.matchMode === MatchMode.ALL ||
            this.matchMode === MatchMode.BLOCKS ||
            (this.matchMode === MatchMode.CUSTOM && this.indexAllBlocks)
          ) {
            this.onIndexerUpdate({ type: IndexerEventType.BLOCK_CACHED, data: blockEntry });
          }
        }
      }
      this._pendingBlocks = [];
    }
    
    this._pruneInMemoryBuffer(
      this._pendingTxs,
      this._inMemoryMaxTxs,
      EvictionReason.IN_MEMORY_TRANSACTION,
      IndexerStore.TRANSACTIONS,
      "txid"
    );

    this._pruneInMemoryBuffer(
      this._pendingBlocks,
      this._inMemoryMaxBlocks,
      EvictionReason.IN_MEMORY_BLOCK,
      IndexerStore.BLOCKS,
      "hash"
    );
  }

  /**
   * Evict old entries based on TTL and max size.
   * @returns {Promise<void>}
   */
  async evict() {
    await this._dbReady;
    const now = Date.now();
    const stdOnEvict = (storeName) => (evictInfo) => {
      if (this.onIndexerUpdate) {        
        this.onIndexerUpdate({
          type: IndexerEventType.EVICT,
          data: {
            key: evictInfo.key,
            reason: evictInfo.reason,
            storeName
          }
        });
      }
    };

    if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.MATCHING) {
      await this._evictStore(IndexerStore.MATCHING_TRANSACTIONS, "txid", stdOnEvict(IndexerStore.MATCHING_TRANSACTIONS), now);
    }
    if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.TRANSACTIONS) {
      await this._evictStore(IndexerStore.TRANSACTIONS, "txid", stdOnEvict(IndexerStore.TRANSACTIONS), now);
    }
    if (this.matchMode === MatchMode.ALL || this.matchMode === MatchMode.BLOCKS) {
      await this._evictStore(IndexerStore.BLOCKS, "hash", stdOnEvict(IndexerStore.BLOCKS), now);
    }
    if (this.matchMode === MatchMode.CUSTOM) {
      if (this.indexAllMatchingTransactions) {
        await this._evictStore(IndexerStore.MATCHING_TRANSACTIONS, "txid", stdOnEvict(IndexerStore.MATCHING_TRANSACTIONS), now);
      }
      if (this.indexAllTransactions) {
        await this._evictStore(IndexerStore.TRANSACTIONS, "txid", stdOnEvict(IndexerStore.TRANSACTIONS), now);
      }
      if (this.indexAllBlocks) {
        await this._evictStore(IndexerStore.BLOCKS, "hash", stdOnEvict(IndexerStore.BLOCKS), now);
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

  /* In-memory Getters */
  
  /**
   * Get matching transactions in memory.
   * @returns {Object[]}
   */
  getAllMatchingTransactions() {
    return this._pendingTxs.filter(({ isMatch }) => isMatch).map(({ entry }) => entry);
  }

  /**
   * Get all transactions in memory.
   * @returns {Object[]}
   */
  getAllTransactions() {
    return this._pendingTxs.map(({ entry }) => entry);
  }
  
  /** Get all blocks in memory.
   * @returns {Object[]}
   */
  getAllBlocks() {
    return this._pendingBlocks.slice();
  }

  /**
   * Get a transaction by its txid from in-memory buffer.
   * @param {string} txid - The transaction ID.
   * @returns {Object|null} - The matching transaction or null.
   */
  getTransaction(txid) {
    const match = this._pendingTxs.find(({ entry }) => entry.txid === txid);
    return match ? match.entry : null;
  }

/* IndexedDB Getters */

  /**
   * Get a transaction by its txid.
   * @param {string} txid - The transaction ID.
   * @returns {Promise<Object|null>} - The matching transaction or null.
   */
  async getCachedTransaction(txid) {
    return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, txs => txs.find(tx => tx.txid === txid) || null);
  }

  /**
   * Get all matching indexed transactions.
   * @returns {Promise<Object[]>} - Array of all transactions.
   */
  async getAllCachedMatchingTransactions() {
    return this._queryStore(IndexerStore.MATCHING_TRANSACTIONS, txs => txs);
  }

  /**
   * Get all indexed transactions.
   * @returns {Promise<Object[]>} - Array of all blocks.
   */
  async getAllCachedTransactions() {
    return this._queryStore(IndexerStore.TRANSACTIONS, txs => txs);
  }

  /**
   * Get all indexed blocks.
   * @returns {Promise<Object[]>} - Array of all blocks.
   */
  async getAllCachedBlocks() {
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
  async getMostRecentCachedTransaction(sender, receiver, blockDaaScore, amount) {
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
  async getCachedTransactionsAfterBlockDaaScore(minBlockDaaScore) {
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
  async getCachedTransactionsForAddress(address, recentSeconds = null) {
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

/* Internal helpers */

  _startEvictionTimer() {
    if (this._evictionInterval) clearInterval(this._evictionInterval);
    const interval = this.ttlMs && this.ttlMs > 0 ? this.ttlMs : 600000;
    this._evictionInterval = setInterval(() => {
      this.evict();
    }, interval);
  }

  _startFlushTimer() {
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = setInterval(() => this.flush(), this._flushInterval);
  }

  _stopEvictionTimer() {
    if (this._evictionInterval) {
      clearInterval(this._evictionInterval);
      this._evictionInterval = null;
    }
  }

  _stopFlushTimer() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  /**
   * (Internal) Preload recent txids into in-memory cache for deduplication.
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
   * (Internal) Helper to prune in-memory buffer to max size.
   * @param {Array} buffer - The in-memory buffer array.
   * @param {number} max - The maximum allowed size.
   * @param {string} evictionReason - Reason for eviction.
   * @param {string} storeName - Name of the store.
   * @param {string} keyField - Key field name.
   */   
  _pruneInMemoryBuffer(buffer, max, evictionReason, storeName, keyField) {
    while (buffer.length > max) {
      const removed = buffer.shift();
      if (this.onIndexerUpdate && removed) {
        this.onIndexerUpdate({
          type: IndexerEventType.EVICT,
          data: {
            key: removed.entry ? removed.entry[keyField] : removed[keyField],
            reason: evictionReason,
            storeName
          }
        });
      }
    }
  }

    /**
   * Prune an IndexedDB store by TTL and/or max size.
   * @param {string} storeName - The name of the store (use IndexerStore constant).
   * @param {string} keyField - The key field name (e.g., "txid" or "hash").
   * @param {function} onEvict - Callback for each evicted item.
   * @returns {Promise<void>}
   */
  async _pruneIndexedDBStore(storeName, keyField, onEvict) {
    await this._dbReady;
    const now = Date.now();
    const storeTx = this.db.transaction(storeName, "readwrite");
    const store = storeTx.objectStore(storeName);
  
    // TTL-based pruning
    if (this.ttlMs) {
      await this._evictByTTL(store, keyField, now, this.ttlMs, onEvict);
    }
    // Size-based pruning
    if (this.maxSize) {
      this._evictBySize(store, keyField, this.maxSize, onEvict);
    }
  }

  /** 
   * (Internal) Helper to evict from a given store, enforcing eviction priority. 
   */
  async _evictStore(storeName, keyField, onEvict, now) {
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
        if (this.onIndexerUpdate) {
          this.onIndexerUpdate({
            type: 'evict',
            data: {
              key: evictInfo.key,
              reason: evictInfo.reason,
              storeName
            }
          });
        }
      };

      if (this.priorityTTL) {
        if (this.ttlMs) await this._evictByTTL(store, keyField, now, this.ttlMs, onEvictAndRemove);
        if (this.maxSize) this._evictBySize(store, keyField, this.maxSize, onEvictAndRemove);
      } else {
        if (this.maxSize) this._evictBySize(store, keyField, this.maxSize, onEvictAndRemove);
        if (this.ttlMs) await this._evictByTTL(store, keyField, now, this.ttlMs, onEvictAndRemove);
      }
  }

  /** 
   * (Internal) Evict items from a store by TTL. 
   */
  async _evictByTTL(store, keyField, now, ttlMs, onEvict) {
    const cutoff = now - ttlMs;
    const index = store.index("timestamp");
    const range = IDBKeyRange.upperBound(cutoff);
  
    // First, count total items and expired items
    const totalCount = await new Promise(resolve => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  
    const expiredCount = await new Promise(resolve => {
      let count = 0;
      const req = index.openCursor(range);
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          count++;
          cursor.continue();
        } else {
          resolve(count);
        }
      };
      req.onerror = () => resolve(0);
    });
  
    const batchThreshold = Math.floor(totalCount * this.batchThresholdRatio);
  
    // Now, batch remove if expiredCount >= batchThreshold
    if (expiredCount >= batchThreshold) {
      await new Promise((resolve) => {
        const req = index.openCursor(range);
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
          } else {
            resolve();
          }
        };
        req.onerror = (e) => {
          console.error("IndexedDB openCursor failed (TTL eviction):", e.target.error);
          resolve();
        };
      });
    }
    // Otherwise, keep your normal one-by-one eviction logic (if you want)
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
        const batchThreshold = Math.floor(maxSize * this.batchThresholdRatio);
        const index = store.index("timestamp");
        const cursorReq = index.openCursor();
        let deleted = 0;
        cursorReq.onerror = (err) => {
          console.error("IndexedDB openCursor failed (Size eviction):", err.target.error);
        };
        cursorReq.onsuccess = (ev) => {
          const cursor = ev.target.result;
          // If we're way over, batch remove all excess in one go
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