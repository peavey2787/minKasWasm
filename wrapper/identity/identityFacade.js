import * as walletService from './wallet_service.js';
import * as storage from './storage.js';

export class IdentityFacade {
  constructor() {
    // Expose the raw service and storage modules for advanced usage
    this.walletService = walletService;
    this.storage = storage;
  }

  /**
   * Initialize the wallet service with an RPC client.
   * @param {Object} options
   * @param {Object} options.client - The Kaspa RPC client.
   * @param {string} [options.networkId] - Network ID (e.g. 'testnet-10').
   * @param {string} [options.balanceElementId] - Optional DOM ID for auto-updating balance.
   */
  async init({ client, networkId, balanceElementId } = {}) {
    // Map 'client' to 'rpcClient' as expected by wallet_service
    return walletService.init({ rpcClient: client, networkId, balanceElementId });
  }

  /**
   * Create a new wallet or open an existing one.
   * @param {Object} options
   * @param {string} options.password - Wallet password.
   * @param {string} [options.filename] - Filename to save/load.
   * @param {string} [options.mnemonic] - Mnemonic to import (optional).
   * @param {boolean} [options.storeMnemonic] - Whether to store the mnemonic (default false).
   * @returns {Promise<{address: string, mnemonic: string}>}
   */
  async createWallet(options) {
    return walletService.createWallet(options);
  }

  /**
   * Get the current spendable balance of the active wallet.
   * @returns {Promise<bigint>} Balance in Sompi.
   */
  async getSpendableBalance() {
    return walletService.getSpendableBalance();
  }

  /**
   * Send a transaction.
   * @param {Object} options
   * @param {string} options.toAddress - Recipient address.
   * @param {number|string} options.amount - Amount in KAS.
   * @param {string} [options.payload] - Optional transaction payload.
   * @param {string} [options.password] - Wallet password (if required by service).
   * @param {number} [options.priorityFeeKas] - Priority fee in KAS.
   * @returns {Promise<Object>} Transaction result.
   */
  async send(options) {
    return walletService.send(options);
  }

  /**
   * Generate a new receive address for the current wallet.
   * @returns {Promise<string>} New address.
   */
  async generateNewAddress() {
    return walletService.generateNewAddress();
  }

  /**
   * Generate a new keypair (e.g. for encryption or advanced signing).
   * @param {number} [index=0] - Child index for derivation.
   * @returns {Promise<{privateKey: string, publicKey: string}>}
   */
  async generateNewKeypair(index) {
    return walletService.generateNewKeypair(index);
  }

  /**
   * Get a list of all stored wallets.
   * @returns {Promise<Array<{filename: string, title: string}>>}
   */
  async getAllWallets() {
    return walletService.getAllWallets();
  }

  /**
   * Get the mnemonic for a specific wallet.
   * @param {string} filename 
   * @param {string} password 
   * @returns {Promise<string>} Mnemonic phrase.
   */
  async getMnemonic(filename, password) {
    return walletService.getMnemonic(filename, password);
  }

  /**
   * Delete a wallet from storage.
   * @param {string} filename 
   */
  async deleteWallet(filename) {
    return storage.deleteWalletData(filename);
  }

  /**
   * Access the Wallet class definition if available.
   * This allows advanced users to instantiate Wallet directly if needed.
   */
  get Wallet() {
    return walletService.Wallet;
  }

  /**
   * Access the active wallet instance if exposed by the service.
   */
  get activeWallet() {
    return walletService.wallet;
  }
}