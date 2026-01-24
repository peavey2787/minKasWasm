import * as walletService from "./wallet_service.js";
import * as storage from "./storage.js";

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
    return walletService.init({
      rpcClient: client,
      networkId,
      balanceElementId,
    });
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
  async createOrOpenWallet(options) {
    return walletService.createWallet(options);
  }

  /** Close the active wallet.
   * @returns {Promise<void>}
   */
  async closeWallet() {
    return walletService.closeWallet();
  }

  /** Set the active account by index.
   * @param {number} index - Account index to activate.
   * @returns {Promise<void>}
   */
  async setActiveAccount(index) {
    return walletService.activateAccount(index);
  }

  /** Generate a new receive address for the current wallet.
   * @returns {Promise<string>} New address.
   */
  async generateNewAddress() {
    return walletService.generateNewAddress();
  }

  /** Estimate transaction fee.
   * @param {number|string} amount - Amount in KAS.
   * @param {string} toAddress - Recipient address.
   * @param {string} [payload] - Optional transaction payload.
   * @param {number} [priorityFeeKas] - Priority fee in KAS.
   * @returns {Promise<number>} Estimated fee in KAS.
   */
  async estimateTransactionFee(amount, toAddress, payload, priorityFeeKas) {
    return walletService.estimateTransactionFee(
      amount,
      toAddress,
      payload,
      priorityFeeKas,
    );
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
  get wallet() {
    return walletService.getWalletContext();
  }

  /**
   * Access the wallet secret of the active wallet.
   */
  get walletSecret() {
    return walletService.getWalletSecret();
  }

  /**
   * Access the mnemonic of the active wallet.
   */
  get mnemonic() {
    return walletService.getMnemonic();
  }

  async getXprv() {
    return walletService.getXprv();
  }

  /**
   * Access the active wallet instance if exposed by the service.
   */
  get allWallets() {
    return walletService.getAllWallets();
  }

  /**
   * Access the spendable balance of the active wallet.
   */
  get spendableBalance() {
    return walletService.getSpendableBalance();
  }
}
