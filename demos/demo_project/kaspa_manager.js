// KaspaManager.js
// Singleton class to manage Kaspa client and walletService
import { connect } from '../../wrapper/kaspa_client.js';
import * as walletService from '../../wrapper/wallet_service.js';
import { KaspaBlockScanner } from '../../wrapper/scanner.js';

class KaspaManager {
    // Connect to Kaspa client and initialize wallet service
    async connect() {
      await this.initKaspaClient();
      await this.initWalletService();
    }

    
  static instance = null;

  static getInstance() {
    if (!KaspaManager.instance) {
      KaspaManager.instance = new KaspaManager();
    }
    return KaspaManager.instance;
  }

  constructor() {
    this.kaspaClient = null;
    this.walletService = walletService;
    this.clientInitialized = false;
    this.walletServiceInitialized = false;
    this.blockScanner = null;
    this.latestBlockHash = null;
  }

  getBlockScanner() {
    return this.blockScanner;
  }

  getLatestBlockHash() {
    return this.latestBlockHash;
  }

  getKaspaClient() {
    return this.kaspaClient;
  }

  getWalletService() {
    return this.walletService;
  }

  async initKaspaClient() {
    if (this.clientInitialized) return;
    this.kaspaClient = await connect(null, 'testnet-10', {
      onDisconnect: () => {
        // Example: Update UI or notify user on disconnect
        const statusDiv = document.getElementById('status-div');
        if (statusDiv) statusDiv.textContent = 'Disconnected from Kaspa node.';
      }
    });

    this.clientInitialized = true;
  }

  async initWalletService() {
    if (!this.clientInitialized) {      
      throw new Error('Kaspa client must be initialized before wallet service.');
    }
    
    if (this.walletServiceInitialized) return;
    
    // Wait for kaspaClient.resolver to be available
    await this.waitForKaspaClientReady();

    // Always pass the wallet-balance element ID for balance updates
    await this.walletService.init({
      rpcClient: this.kaspaClient,
      networkId: 'testnet-10',
      balanceElementId: 'wallet-balance'
    });
    
    this.walletServiceInitialized = true;
  }

  async initBlockScanner() {
    // Initialize block scanner and subscribe to new blocks
    this.blockScanner = new KaspaBlockScanner(this.kaspaClient);
    await this.blockScanner.start((block) => {
      if (block && block.header && block.header.hash) {
        this.latestBlockHash = block.header.hash;
      }
    });
  }

  async waitForKaspaClientReady(timeout = 3000) {
    const start = Date.now();
    console.log('Waiting for Kaspa client to be ready...');
    while (!this.kaspaClient?.resolver) {
      if (Date.now() - start > timeout) {
        console.error('Kaspa client resolver not ready after timeout');
        throw new Error('Kaspa client resolver not ready after timeout');
      }
      await new Promise(res => setTimeout(res, 50));
    }
    console.log('Kaspa client is ready.');
  }

  // Create wallet with given password and filename
  async createWallet({ password, filename }) {
    if (!this.walletServiceInitialized) {
      throw new Error('Wallet service not initialized.');
    }
    // Use walletService.createWallet
    return await this.walletService.createWallet({ password, filename });
  }

  // Get receiving address of the wallet
  async getAddress() {
    if (!this.walletServiceInitialized) {
      throw new Error('Wallet service not initialized.');
    }
    // Activate account and return address
    return await this.walletService.activateAccount();
  }

  // Get wallet balance
  async getBalance() {
    if (!this.walletServiceInitialized) {
      throw new Error('Wallet service not initialized.');
    }
    const bal = await this.walletService.getSpendableBalance();
    // Convert BigInt to string KAS
    return this.walletService.sompiToKaspaString ? this.walletService.sompiToKaspaString(bal) : bal.toString();
  }

  // Listen for balance changes
  onBalanceChange(callback) {
    if (!this.walletServiceInitialized) {
      throw new Error('Wallet service not initialized.');
    }
    // Re-init walletService with callback
    this.walletService.init({
      rpcClient: this.kaspaClient,
      networkId: 'testnet-10',
      balanceElementId: null,
      onBalanceChange: callback
    });
  }
}

export default KaspaManager;