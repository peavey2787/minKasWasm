import { walkDagToPresent, scanDagForward, scanDagBackward } from './dag_walk.js';
import { KaspaBlockScanner } from './scanner.js';
import { IndexerEventType, EvictionReason } from './indexer.js';

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
      indexerOptions: { ...indexerOptions, onIndexerUpdate }
    });

    // Expose the indexer for direct queries (getMetrics, getAllCachedBlocks, etc.)
    this.indexer = this.scanner.indexer;
    
    this._activeTasks = new AbortController();
  }

  _handleIndexerUpdate = (event) => {
    const { type, data } = event;

    switch (type) {
      case IndexerEventType.TRANSACTION_IN_MEMORY:
        this._trigger('onNewTransaction', data);
        break;
      case IndexerEventType.MATCHING_TRANSACTION_IN_MEMORY:
        this._trigger('onNewTransactionMatch', data);
        break;
      case IndexerEventType.BLOCK_IN_MEMORY:
        this._trigger('onNewBlock', data);
        break;
      case IndexerEventType.TRANSACTION_CACHED:
        this._trigger('onCachedTransaction', data);
        break;
      case IndexerEventType.MATCHING_TRANSACTION_CACHED:
        this._trigger('onCachedTransactionMatch', data);
        break;
      case IndexerEventType.BLOCK_CACHED:
        this._trigger('onCachedBlock', data);
        break;
      case IndexerEventType.EVICT:
        // Differentiate between cache evictions and full evictions
        if (data?.reason === EvictionReason.TTL || data?.reason === EvictionReason.SIZE) {
          this._trigger('onCacheEvict', data);
        } else {
          this._trigger('onEvict', data);
        }
        break;
      default:
        console.warn("IntelligenceFacade: Unknown event type:", type);
    }
  };

  _trigger(name, data) {
    if (typeof this._callbacks[name] === 'function') {
      this._callbacks[name](data);
    }
  }

  onNewBlock(cb) { this._callbacks.onNewBlock = cb; return this; }
  onNewTransaction(cb) { this._callbacks.onNewTransaction = cb; return this; }
  onNewTransactionMatch(cb) { this._callbacks.onNewTransactionMatch = cb; return this; }
  onCachedBlock(cb) { this._callbacks.onCachedBlock = cb; return this; }
  onCachedTransaction(cb) { this._callbacks.onCachedTransaction = cb; return this; }
  onCachedTransactionMatch(cb) { this._callbacks.onCachedTransactionMatch = cb; return this; }
  onEvict(cb) { this._callbacks.onEvict = cb; return this; }
  onCacheEvict(cb) { this._callbacks.onCacheEvict = cb; return this; }

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

  /**
   * Sync from a specific point. 
   * Feeds the indexer, which triggers the 'IN_MEMORY' and 'CACHED' events.
   */
  async syncFrom(startHash, logFn = null) {
    return walkDagToPresent({
      client: this.client,
      startHash,
      logFn,
      onBlock: (block) => {
        this.indexer.addBlock(block);
        return false; 
      }
    });
  }

  async findPayload(startHash, searchText, mode = 'contains') {
    return scanDagForward({ client: this.client, startHash, searchText, matchMode: mode });
  }

  async findHistorical(startHash, matchFn) {
    return scanDagBackward({ client: this.client, startHash, matchFn });
  }

  shutdown() {
    this._activeTasks.abort();
    this.scanner.stop();
    this.indexer.stop();
  }
}