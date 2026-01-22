// KaspaStack.js (The Wrapper Facade)
import { wallet_service } from './wallet_service.js';
import { KaspaBlockScanner } from './scanner.js';
import { KaspaIndexer } from './indexer.js';
import { DAGWalker } from './dag_walker.js';

export class KaspaStack {
  constructor(client, networkId) {
    this.client = client;
    this.networkId = networkId;

    // Sub-components are still distinct but managed here
    this.wallet = wallet_service; 
    this.indexer = new KaspaIndexer({ dbName: `idx_${networkId}` });
    this.scanner = new KaspaBlockScanner(client, { indexer: this.indexer });
    this.walker = new DAGWalker(client);
  }

  /**
   * The "Big Green Button" for the dev.
   * Boots the database, identifies the user, and starts the scanner.
   */
  async powerOn(password) {
    // 1. Storage & Indexer setup
    await this.indexer.initDB();
    this.indexer.start();

    // 2. Wallet & Identity
    this.wallet.init({ rpcClient: this.client, networkId: this.networkId });
    const identity = await this.wallet.createWallet({ password });

    // 3. Network Intel (Start scanning for this specific wallet)
    this.scanner.addresses = [identity.address];
    await this.scanner.start((block, matches) => {
       // This fires events that the Master Facade will listen to
    });

    return identity;
  }

  /**
   * A "Sync" method that uses the DAG Walker to catch up
   */
  async syncHistory(startBlueScore) {
    return await this.walker.walkFrom(startBlueScore);
  }

  /**
   * Clean Shutdown (The "Memory Leak Killer")
   */
  async powerOff() {
    this.scanner.stop();
    this.indexer.stop();
    await this.wallet.closeWallet();
    // Clear any WASM references here
  }
}