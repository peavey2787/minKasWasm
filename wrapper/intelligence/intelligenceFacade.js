import { walkDagToPresent, scanDagForward, scanDagBackward } from './dag_walker.js';
import { KaspaBlockScanner } from './scanner.js';

export class IntelligenceFacade {
  /**
   * @param {Object} client - Kaspa RPC client
   * @param {Object} scannerOptions - { prefix, addresses, mode }
   * @param {Object} indexerOptions - { dbName, matchMode, onIndexerUpdate, ttlMinutes, etc. }
   */
  constructor(client, scannerOptions = {}, indexerOptions = {}) {
    this.client = client;

    // The Scanner is the "Worker" - it creates and owns the Indexer
    // We pass the indexerOptions straight through as the scanner expects.
    this.scanner = new KaspaBlockScanner(client, {
      ...scannerOptions,
      indexerOptions: indexerOptions
    });

    // Expose the indexer for direct queries (getMetrics, getAllCachedBlocks, etc.)
    this.indexer = this.scanner.indexer;
    
    this._activeTasks = new AbortController();
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