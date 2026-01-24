import { KKTPProtocol } from "../kktp/protocol/kktpProtocol.js";
import { TransportFacade } from "./transport/transportFacade.js";
import { IdentityFacade } from "./identity/identityFacade.js";
import { IntelligenceFacade } from "./intelligence/intelligenceFacade.js";
import { CryptoFacade } from "./crypto/cryptoFacade.js";
import { VrfFacade } from "./vrf/vrfFacade.js";
import { SearchMode } from "./intelligence/scanner.js";
import {
  IndexerEventType,
  MatchMode,
  EvictionReason,
  IndexerStore,
} from "./intelligence/indexer.js";

// Re-export common enums for convenience
export {
  SearchMode,
  IndexerEventType,
  MatchMode,
  EvictionReason,
  IndexerStore,
};

/**
 * KaspaPortal: The Master Facade.
 * Provides a single entry point for Transport, Identity, Intelligence, and Crypto services.
 */
export class KaspaPortal {
  /**
   * @param {Object} [options] - Configuration options.
   * @param {Object} [options.intelligence] - Options for IntelligenceFacade { scanner: {}, indexer: {} }.
   */
  constructor(options = {}) {
    this._isReady = false;
    this.kktpProtocol = new KKTPProtocol();
    this.transport = new TransportFacade();
    this.identity = new IdentityFacade();
    this.crypto = new CryptoFacade();
    this.vrf = new VrfFacade();

    // Initialize Intelligence with a null client initially.
    // This allows users to attach event listeners (e.g. portal.intelligence.onNewBlock)
    // before the connection is established. The client is injected in connect().
    const intelligenceOpts = options.intelligence || {};
    this.intelligence = new IntelligenceFacade(
      null,
      intelligenceOpts.scanner || {},
      intelligenceOpts.indexer || {},
    );
  }

  /**
   * Connect to the Kaspa network and initialize all services.
   *
   * @param {string} [rpcUrl] - WebSocket URL or null for public resolver.
   * @param {string} [networkId="testnet-10"] - Network ID.
   * @param {Object} [options] - Connection options.
   * @param {function} [options.onDisconnect] - Callback for disconnection.
   * @param {string} [options.balanceElementId] - DOM ID for auto-updating balance (Identity).
   * @param {boolean} [options.startIntelligence=true] - Whether to automatically start the Intelligence scanner/indexer.
   */
  async connect(
    rpcUrl,
    networkId = "testnet-10",
    { onDisconnect, balanceElementId, startIntelligence = true } = {},
  ) {

    // 1. Connect Transport
    await this.transport.connect(rpcUrl, networkId, { onDisconnect });

    // 2. Initialize Identity
    await this.identity.init({
      client: this.transport.client,
      networkId,
      balanceElementId,
    });

    // 3. Inject Client into Intelligence
    // Since we instantiated it with null, we now provide the active client.
    this.intelligence.client = this.transport.client;
    if (this.intelligence.scanner) {
      this.intelligence.scanner.client = this.transport.client;
    }

    // 4. Start Intelligence (optional)
    if (startIntelligence) {
      await this.intelligence.start();
    }

    this._isReady = true;
    return this.transport.client;
  }

  /**
   * Disconnect from the network and shutdown services.
   */
  async disconnect() {
    this._isReady = false;
    if (this.intelligence) {
      this.intelligence.shutdown();
    }
    await this.transport.disconnect();
  }

  /**
   * Check if the portal is connected and all services are ready.
   */
  get isReady() {
    return this._isReady;
  }

  /**
   * Access the underlying RPC client directly.
   */
  get client() {
    return this.transport.client;
  }

  /**
   * Access the active wallet instance directly.
   */
  get wallet() {
    return this.identity.wallet;
  }

  // --- Wallet Proxy Methods ---

  /**
   * Opens an existing wallet or creates a new one.
   * This is where you actually provide the password and mnemonic.
   * * @param {Object} options - { password, mnemonic, filename, storeMnemonic }
   * @returns {Promise<{address: string, mnemonic?: string}>}
   */
  async openOrCreateWallet(options) {
    if (!this._isReady) {
      throw new Error(
        "KaspaPortal: You must call connect() before opening a wallet.",
      );
    }
    const result = await this.identity.createOrOpenWallet(options);
    return result;
  }

  /**
   * Send a transaction (delegates to Identity).
   * @param {Object} options - { toAddress, amount, payload, priorityFeeKas }
   */
  async send(options) {
    return this.identity.send(options);
  }

  /**
   * Get spendable balance (delegates to Identity).
   * @returns {Promise<bigint>}
   */
  async getBalance() {
    return this.identity.getSpendableBalance();
  }

  // --- Intelligence Proxy Methods ---

  /**
   * Dynamically updates the payload prefix the scanner is looking for.
   * @param {string} prefix - The new prefix (e.g., "KKTP:mailbox_id:").
   */
  setScannerPrefix(prefix) {
    if (this.intelligence && this.intelligence.scanner) {
      this.intelligence.scanner.prefix = prefix;
    }
  }

  /**
   * Subscribe to new blocks (delegates to Intelligence).
   */
  onNewBlock(cb) {
    this.intelligence.onNewBlock(cb);
    return this;
  }

  /**
   * Subscribe to new transactions (delegates to Intelligence).
   */
  onNewTransaction(cb) {
    this.intelligence.onNewTransaction(cb);
    return this;
  }

  /**
   * Subscribe to new matching transactions (delegates to Intelligence).
   */
  onNewTransactionMatch(cb) {
    this.intelligence.onNewTransactionMatch(cb);
    return this;
  }

  /**
   * Subscribe to cached transactions (delegates to Intelligence).
   */
  onCachedTransaction(cb) {
    this.intelligence.onCachedTransaction(cb);
    return this;
  }

  /**
   * Subscribe to cached matching transactions (delegates to Intelligence).
   */
  onCachedTransactionMatch(cb) {
    this.intelligence.onCachedTransactionMatch(cb);
    return this;
  }

  /**
   * Subscribe to cached blocks (delegates to Intelligence).
   */
  onCachedBlock(cb) {
    this.intelligence.onCachedBlock(cb);
    return this;
  }

  /**
   * Subscribe to eviction events (delegates to Intelligence).
   */
  onEvict(cb) {
    this.intelligence.onEvict(cb);
    return this;
  }

  /**
   * Subscribe to cache eviction events (delegates to Intelligence).
   */
  onCacheEvict(cb) {
    this.intelligence.onCacheEvict(cb);
    return this;
  }

  // --- Crypto Proxy Methods ---

  /**
   * Encrypt a message (delegates to Crypto).
   */
  encrypt(text, password) {
    return this.crypto.encrypt(text, password);
  }

  /**
   * Decrypt a message (delegates to Crypto).
   */
  decrypt(encrypted, password) {
    return this.crypto.decrypt(encrypted, password);
  }

  /**
   * Derive two distinct keypairs (Signing & DH) from the same identity seed.
   * @param {number} index - The session or user index.
   */
  async generateIdentityKeys(index) {
    if (!this.identity.wallet.walletInitialized) {
      throw new Error("KaspaPortal: Wallet must be initialized.");
    }

    // 1. Await the actual string from the facade
    const xprv = await this.identity.getXprv();

    // 2. Safety Check: If xprv is an object or undefined, WASM will crash
    if (typeof xprv !== 'string') {
      console.error("CRITICAL: xprv is not a string!", xprv);
      throw new Error(`Expected xprv string, got ${typeof xprv}`);
    }

    return await this.crypto.generateIdentityKeys(xprv, index);
  }

  /**
   * Start a new Diffie-Hellman session using keys derived from the active wallet.
   * @param {number} index - Child index for key derivation.
   * @returns {Promise<DHSession>} An initialized DHSession object.
   */
  async startSession(index) {
    if (!this.identity.wallet.walletInitialized) {
      throw new Error("KaspaPortal: Wallet must be initialized before starting a session.");
    }
    const { dh } = await this.generateIdentityKeys(index);
    return this.crypto.createDHSession(dh.privateKey, dh.publicKey);
  }

  /**
   * Sign an anchor object (delegates to Crypto).
   * @param {Object} anchor - The anchor to sign.
   * @returns {Promise<string>} The signature.
   */
  async signAnchor(anchor) {
    if (!this.identity.wallet.walletInitialized) {
      throw new Error("KaspaPortal: Wallet must be initialized.");
    }
    const { sig } = await this.generateIdentityKeys(0);
    return await this.kktpProtocol.signAnchor(anchor, sig.privateKey);
  }

  /**
   * Sign a message (delegates to Crypto).
   * @param {string} privateKeyHex - Private key hex string.
   * @param {string} message - The canonicalized message body.
   * @returns {Promise<string>} The signature.
   */
  async signMessage(privateKeyHex, message) {
    return await this.crypto.signMessage(privateKeyHex, message);
  }

  /**
   * Verify a message signature (delegates to Crypto).
   * @param {string} publicKey - Public key hex string.
   * @param {string} body - The canonicalized message body.
   * @param {string} sig - The signature to verify.
   * @returns {Promise<boolean>} True if valid, false otherwise.
   */
  async verifyMessage(publicKey, body, sig) {
    return await this.crypto.verifyMessage(publicKey, body, sig);
  }

  // --- VRF Proxy Methods ---

  /**
   * Fetch randomness blocks from various sources (delegates to VRF).
   * @param {string} source - 'bitcoin', 'kaspa', 'qrng', 'hybrid'
   * @param {number} n - Number of blocks/items
   * @returns {Promise<Object>}
   */
  async fetchBlocks(source, n) {
    return this.vrf.fetchBlocks(source, n);
  }

  /**
   * Fetch Bitcoin blocks (delegates to VRF).
   * @param {number} n - Number of blocks
   * @returns {Promise<Array>}
   */
  async getBitcoinBlocks(n) {
    return this.vrf.getBitcoinBlocks(n);
  }

  /**
   * Fetch QRNG data (delegates to VRF).
   * @param {string} provider - 'nist', 'anu', 'qrandom'
   * @param {number} length - Number of bytes
   * @returns {Promise<Array>}
   */
  async getQRNG(provider, length) {
    return this.vrf.getQRNG(provider, length);
  }

  /**
   * Fold two sources of randomness (delegates to VRF).
   * @param {string} data1 - Hex string
   * @param {string} data2 - Hex string
   * @param {Object} options - { iterations }
   * @returns {Promise<string>} Folded result
   */
  async fold(data1, data2, options) {
    return this.vrf.fold(data1, data2, options);
  }

  /**
   * Run the full NIST SP 800-22 test suite on a bitstring (delegates to VRF).
   * @param {string} bits - Binary string
   * @returns {Promise<Object[]>} Test results
   */
  async fullNIST(bits) {
    return this.vrf.fullNIST(bits);
  }

  /**
   * Run a basic subset of NIST tests (delegates to VRF).
   * @param {string} bits - Binary string
   * @returns {Promise<Object[]>} Test results
   */
  async basicNIST(bits) {
    return this.vrf.basicNIST(bits);
  }

  /**
   * Generate full randomness using QRNG + Kaspa + BTC (delegates to VRF).
   * @returns {Promise<string>} Folded result
   */
  async generateFullRandomness() {
    return this.vrf.generateFullRandomness();
  }

  /**
   * Generate partial randomness using Kaspa + BTC (delegates to VRF).
   * @returns {Promise<string>} Folded result
   */
  async generatePartialRandomness() {
    return this.vrf.generatePartialRandomness();
  }
}

// Instantiate it once here
export const kaspaPortal = new KaspaPortal();
