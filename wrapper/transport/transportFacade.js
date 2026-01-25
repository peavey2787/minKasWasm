import { connect } from "./kaspa_client.js";
import * as txBuilder from "./tx_builder.js";
import * as utxoManager from "./utxo_manager.js";
import { runRpcCommand } from "./rpc_runner.js";

export class TransportFacade {
  constructor() {
    this.client = null;
  }

  /**
   * Connect to a Kaspa node.
   * @param {string} [rpcUrl] - WebSocket URL (e.g. "ws://127.0.0.1:17110") or null for public resolver.
   * @param {string} [networkId="testnet-10"] - Network ID.
   * @param {Object} [options] - Connection options (e.g. { onDisconnect }).
   */
  async connect(rpcUrl, networkId, options) {
    this.client = await connect(rpcUrl, networkId, options);
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
  }

  get isConnected() {
    return !!(this.client && this.client.isConnected);
  }

  // --- UTXO Management ---

  /**
   * Fetch UTXOs for a given account descriptor (receive/change addresses).
   * @param {Object} accountDescriptor - { receiveAddress, changeAddress }
   */
  async getAccountUtxos(accountDescriptor) {
    this._checkConnected();
    // utxoManager expects a wallet-like object with an rpc property
    return utxoManager.getAccountUtxos({
      wallet: { rpc: this.client },
      accountDescriptor,
    });
  }

  /**
   * Select UTXOs for a transaction (Largest First strategy).
   * @param {Array} entries - Array of UTXO entries.
   * @param {Object} options - { targetSompi, maxInputs }
   */
  selectUtxosLargestFirst(entries, options) {
    return utxoManager.selectUtxosLargestFirst(entries, options);
  }

  // --- Transaction Building & Submission ---

  /**
   * Estimate transaction mass and fees.
   */
  async estimateTransaction(args) {
    return txBuilder.estimateTransaction(args);
  }

  /**
   * Build a pending transaction (without signing).
   */
  async buildPendingTransaction(args) {
    return txBuilder.buildPendingTransaction(args);
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

  // --- RPC ---

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
