// indexer.js - Kaspa Transaction Indexer (browser version)
/**
 * Enum for KaspaIndexer event names.
 * @readonly
 * @enum {string}
 */
export const IndexerEvent = Object.freeze({
  TRANSACTION: "transaction",
  EVICTION: "eviction"
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
  TRANSACTIONS: "transactions"
});


export class KaspaIndexer extends EventTarget {
  /**
   * @param {Object} options - Indexer options.
   * @param {number|null} [options.ttlMinutes=null] - How long to store cache entries (minutes).
   * @param {number|null} [options.maxSize=null] - Max number of cached entries before eviction.
   * @param {boolean} [options.priorityTTL=true] - If true, TTL eviction runs first; if false, size eviction runs first.
   * @param {string} [options.dbName="kaspaIndexer"] - IndexedDB database name.
   */
  constructor({ ttlMinutes = null, maxSize = null, priorityTTL = true, dbName = "kaspaIndexer" } = {}) {
    super();
    this.ttlMs = ttlMinutes ? ttlMinutes * 60 * 1000 : null;
    this.maxSize = maxSize;
    this.priorityTTL = priorityTTL;
    this.dbName = dbName;
    this.db = null;
    console.log("ttlMs: ", this.ttlMs, "maxSize:", this.maxSize, "priorityTTL:", this.priorityTTL);
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IndexerStore.TRANSACTIONS)) {
          const store = db.createObjectStore("transactions", { keyPath: "txid" });
          store.createIndex("timestamp", "timestamp");
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => reject(e);
    });
  }

  addTransaction(tx) {
    const now = Date.now();
    const entry = { ...tx, timestamp: now };
    console.log("Indexer: caching tx", entry);
    const txReq = this.db.transaction(IndexerStore.TRANSACTIONS, "readwrite");
    txReq.objectStore(IndexerStore.TRANSACTIONS).put(entry);
  }

  evict() {
    if (!this.db) return;
    const now = Date.now();
    const txReq = this.db.transaction(IndexerStore.TRANSACTIONS, "readwrite");
    const store = txReq.objectStore(IndexerStore.TRANSACTIONS);

    const runTTL = () => {
      if (this.ttlMs) {
        const index = store.index("timestamp");
        const range = IDBKeyRange.upperBound(now - this.ttlMs);
        index.openCursor(range).onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            // Notify listeners
            this.dispatchEvent(new CustomEvent(IndexerEvent.EVICTION, { detail: { txid: cursor.primaryKey, reason: EvictionReason.TTL } }));
            cursor.continue();
          }
        };
      }
    };

    const runSize = () => {
      if (this.maxSize) {
        store.getAll().onsuccess = (ev) => {
          const entries = ev.target.result.sort((a, b) => a.timestamp - b.timestamp);
          if (entries.length > this.maxSize) {
            const excess = entries.length - this.maxSize;
            for (let i = 0; i < excess; i++) {
              store.delete(entries[i].txid);
              // Notify listeners
              this.dispatchEvent(new CustomEvent(IndexerEvent.EVICTION, { detail: { txid: entries[i].txid, reason: EvictionReason.SIZE } }));
            }
          }
        };
      }
    };

    // Run in chosen order
    if (this.priorityTTL) {
      runTTL();
      runSize();
    } else {
      runSize();
      runTTL();
    }
  }

  /**
   * Run a query against the transactions store.
   * @param {function(Object[]): any} processFn - Function to process the full result set.
   * @returns {Promise<any>}
   */
  async _queryTransactions(processFn) {
    return new Promise((resolve) => {
      const txReq = this.db.transaction(IndexerStore.TRANSACTIONS, "readonly");
      const store = txReq.objectStore(IndexerStore.TRANSACTIONS);
      const req = store.getAll();
      req.onsuccess = () => {
        const result = processFn(req.result || []);
        resolve(result);
      };
    });
  }

  /**
   * Get a transaction by its txid.
   * @param {string} txid - The transaction ID.
   * @returns {Promise<Object|null>} - The matching transaction or null.
   */
  async getTransaction(txid) {
    return this._queryTransactions(txs => txs.find(tx => tx.txid === txid) || null);
  }

  /**
   * Get all indexed transactions.
   * @returns {Promise<Object[]>} - Array of all transactions.
   */
  async getAllTransactions() {
    return this._queryTransactions(txs => txs);
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
    return this._queryTransactions(txs => {
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
    return this._queryTransactions(txs =>
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
    return this._queryTransactions(txs => {
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
}
