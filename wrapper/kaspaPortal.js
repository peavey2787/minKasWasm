import { KKTPProtocol } from "../kktp/protocol/kktpProtocol.js";
import { canonicalize } from "../kktp/protocol/integrity/canonical.js";
import { TransportFacade } from "./transport/transportFacade.js";
import { IdentityFacade } from "./identity/identityFacade.js";
import {
  IntelligenceFacade,
  IndexerEventType,
  MatchMode,
  EvictionReason,
  IndexerStore,
  SearchMode,
} from "./intelligence/intelligenceFacade.js";
import { CryptoFacade } from "./crypto/cryptoFacade.js";
import { VRFFacade } from "./vrf/vrfFacade.js";
import { KKTPStateMachine } from "../kktp/protocol/stateMachine.js";
import initKaspa from "./kas-wasm/kaspa.js";

let wasmInitialized = false;

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
  constructor() {
    this._isReady = false;
    this._connectedPromise = null;

    // Initialize sub-facades
    const sm = new KKTPStateMachine(this, true, 0);
    this.kktpProtocol = new KKTPProtocol(sm);
    this.transport = new TransportFacade();
    this.identity = new IdentityFacade();
    this.crypto = new CryptoFacade();
    this.vrf = new VRFFacade(false);
    // Initialized on connect()
    this.intelligence = null;

    // KKTP session tracking (multi-session support)
    this._kktpSessions = new Map(); // mailboxId -> session context
    this._kktpPendingDiscoveries = new Map(); // sid -> pending context
    this._kktpKeyIndex = 0;
  }

  async init() {
    // Initialize Kaspa wasm sdk once
    if (!wasmInitialized) {
      await initKaspa();
      wasmInitialized = true;
    }
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
  async connect({
    rpcUrl,
    networkId = "testnet-10",
    onDisconnect,
    balanceElementId,
    onBalanceChange,
    startIntelligence = true,
    scannerOptions = {},
    indexerOptions = {},
  } = {}) {
    if (this._isReady) return this.transport.client;
    if (this._connectPromise) return this._connectPromise;

    this._connectPromise = (async () => {
      // 1. Connect Transport
      await this.transport.connect({
        rpcUrl,
        networkId,
        onDisconnect,
      });

      // 2. Initialize Identity
      await this.identity.init({
        client: this.transport.client,
        networkId,
        balanceElementId,
        onBalanceChange,
      });

      // 3. Inject Client into Intelligence
      this.intelligence = new IntelligenceFacade(
        this.transport.client,
        scannerOptions,
        indexerOptions,
      );

      await this.intelligence.init();

      // 4. Start Intelligence (optional)
      if (startIntelligence) {
        await this.intelligence.start();
      }

      this._isReady = true;
      return this.transport.client;
    })();

    try {
      return await this._connectPromise;
    } finally {
      this._connectPromise = null;
    }
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
  async createOrOpenWallet(options) {
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
    return await this.identity.send(options);
  }

  /**
   * Get spendable balance (delegates to Identity).
   * @returns {Promise<bigint>}
   */
  async getBalance() {
    return await this.identity.getSpendableBalance();
  }

  // --- Intelligence Proxy Methods ---

  // Scanner Methods

  /** Add an address to the watch list
   * @param {string} address - Kaspa address to watch
   */
  addAddress(address) {
    this.intelligence?.addAddress(address);
  }

  /** Remove an address from the watch list
   * @param {string} address - Kaspa address to remove
   */
  removeAddress(address) {
    this.intelligence?.removeAddress(address);
  }

  /** Set the list of addresses to watch
   * @param {Array<string>|string} addresses - Array of addresses or single address
   */
  setAddresses(addresses) {
    this.intelligence?.setAddresses(addresses);
  }

  /** Add a payload prefix to the watch list
   * @param {string} prefix - Payload prefix to add
   */
  addPrefix(prefix) {
    this.intelligence?.addPrefix(prefix);
  }

  /** Remove a payload prefix from the watch list
   * @param {string} prefix - Payload prefix to remove
   */
  removePrefix(prefix) {
    this.intelligence?.removePrefix(prefix);
  }

  /** Set the list of payload prefixes to watch
   * @param {Array<string>|string} prefixes - Array of prefixes or single prefix
   */
  setPrefixes(prefixes) {
    this.intelligence?.setPrefixes(prefixes);
  }

  /** Set scanner search mode */
  setSearchMode(mode) {
    this.intelligence?.setSearchMode(mode);
  }

  /** Start the live block scanner */
  async startScanner(onBlock) {
    return this.intelligence?.startScanner(onBlock);
  }

  /** Stop the live block scanner */
  stopScanner() {
    this.intelligence?.stopScanner();
  }

  // Indexer Methods

  _ensureIntelligence() {
    if (!this.intelligence) {
      throw new Error(
        "KaspaPortal: Intelligence not initialized. Call connect().",
      );
    }
  }

  getIndexerTimings() {
    this._ensureIntelligence();
    return this.intelligence.getIndexerTimings();
  }

  async startIndexer() {
    this._ensureIntelligence();
    return await this.intelligence.startIndexer();
  }

  stopIndexer() {
    this._ensureIntelligence();
    this.intelligence.stopIndexer();
  }

  async getCachedSnapshot() {
    this._ensureIntelligence();
    return await this.intelligence.getCachedSnapshot();
  }

  getInMemorySnapshot() {
    this._ensureIntelligence();
    return this.intelligence.getInMemorySnapshot();
  }

  async clearIndexerStore(storeName) {
    this._ensureIntelligence();
    return await this.intelligence.clearIndexerStore(storeName);
  }

  /**
   * Sync indexer from a specific block hash to present.
   */
  async syncFrom(startHash, logFn = null, options = {}) {
    this._ensureIntelligence();
    return await this.intelligence.syncFrom(startHash, logFn, options);
  }

  /**
   * Scan forward from a block for payload matches.
   */
  async findPayload(startHash, searchText, mode = "contains", options = {}) {
    this._ensureIntelligence();
    return await this.intelligence.findPayload(
      startHash,
      searchText,
      mode,
      options,
    );
  }

  /**
   * Historical scan backward from a block.
   */
  async findHistorical(startHash, matchFn, options = {}) {
    this._ensureIntelligence();
    return await this.intelligence.findHistorical(startHash, matchFn, options);
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
    if (!this.identity.wallet?.walletInitialized) {
      throw new Error("KaspaPortal: Wallet must be initialized.");
    }
    // 1. Await the actual string from the facade
    const xprv = await this.identity.getXprv();

    // 2. Safety Check: If xprv is an object or undefined, WASM will crash
    if (typeof xprv !== "string") {
      throw new Error(`Expected xprv string, got ${typeof xprv}`);
    }
    return await this.crypto.generateIdentityKeys(xprv, index);
  }

  /**
   * Start a new Diffie-Hellman session using keys derived from the active wallet.
   * @param {number} index - Child index for key derivation.
   * @returns {Promise<DHSession>} An initialized DHSession object.
   */
  async startSession(index, privateKey) {
    if (!this.identity.wallet?.walletInitialized) {
      throw new Error(
        "KaspaPortal: Wallet must be initialized before starting a session.",
      );
    }
    if (privateKey) {
      return this.crypto.createDHSession(privateKey);
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
    if (!this.identity.wallet?.walletInitialized) {
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

  /** PROVE: Generates a VRF proof bundle (delegates to VRF).
   * @param {Object} options - { seedInput, btcBlocks, kasBlocks, iterations }
   * @returns {Promise<Object>} VRF proof object
   */
  async prove({ seedInput, btcBlocks = 6, kasBlocks = 12, iterations = 2 }) {
    return await this.vrf.prove({
      seedInput,
      btcBlocks,
      kasBlocks,
      iterations,
    });
  }

  /**
   * VERIFY: Validates the value against the proof bundle (delegates to VRF).
   * @param {string|Object} valueOrResult - The value or VRF result object.
   * @param {Object} [optionalProof] - The VRF proof object (if not included in valueOrResult).
   * @returns {Promise<boolean>} True if valid, false otherwise.
   */
  async verify(valueOrResult, optionalProof) {
    return await this.vrf.verify(valueOrResult, optionalProof);
  }

  /**
   * Fetch randomness blocks from various sources (delegates to VRF).
   * @param {string} source - 'bitcoin', 'kaspa', 'qrng', 'hybrid'
   * @param {number} n - Number of blocks/items
   * @returns {Promise<Object>}
   */
  async fetchBlocks(source, n) {
    return await this.vrf.fetchBlocks(source, n);
  }

  /**
   * Fetch Bitcoin blocks (delegates to VRF).
   * @param {number} n - Number of blocks
   * @returns {Promise<Array>}
   */
  async getBitcoinBlocks(n) {
    return await this.vrf.getBitcoinBlocks(n);
  }

  /**
   * Fetch QRNG data (delegates to VRF).
   * @param {string} provider - 'nist', 'anu', 'qrandom'
   * @param {number} length - Number of bytes
   * @returns {Promise<Array>}
   */
  async getQRNG(provider, length) {
    return await this.vrf.getQRNG(provider, length);
  }

  /**
   * Fold two sources of randomness (delegates to VRF).
   * @param {string} data1 - Hex string
   * @param {string} data2 - Hex string
   * @param {Object} options - { iterations }
   * @returns {Promise<string>} Folded result
   */
  async fold(data1, data2, options) {
    return await this.vrf.fold(data1, data2, options);
  }

  /**
   * Run the full NIST SP 800-22 test suite on a bitstring (delegates to VRF).
   * @param {string} bits - Binary string
   * @returns {Promise<Object[]>} Test results
   */
  async fullNIST(bits) {
    return await this.vrf.fullNIST(bits);
  }

  /**
   * Run a basic subset of NIST tests (delegates to VRF).
   * @param {string} bits - Binary string
   * @returns {Promise<Object[]>} Test results
   */
  async basicNIST(bits) {
    return await this.vrf.basicNIST(bits);
  }

  /** Verify VRF proof authenticity (delegates to VRF).
   * @param {Object} proof - VRF proof object
   * @returns {Promise<boolean>} True if valid, false otherwise
   */
  async isValidNistSignature(proof) {
    return await this.vrf.isValidNistSignature(proof);
  }

  /**
   * Generate full randomness using QRNG + Kaspa + BTC (delegates to VRF).
   * @returns {Promise<string>} Folded result
   */
  async generateFullRandomness() {
    return await this.vrf.generateFullRandomness();
  }

  /**
   * Generate partial randomness using Kaspa + BTC (delegates to VRF).
   * @returns {Promise<string>} Folded result
   */
  async generatePartialRandomness() {
    return await this.vrf.generatePartialRandomness();
  }

  // --- KKTP Convenience Methods ---

  _createKktpContext(isInitiator) {
    const keyIndex = this._kktpKeyIndex++;
    const sm = new KKTPStateMachine(this, isInitiator, keyIndex);
    const protocol = new KKTPProtocol(sm);
    return { sm, protocol, keyIndex };
  }

  /**
   * Broadcast a signed discovery anchor and register as pending.
   * @param {Object} meta - Discovery meta object
   * @param {Object} [options] - { amount, toAddress }
   */
  async broadcastDiscovery(meta, options = {}) {
    const { amount = "0.001", toAddress } = options;

    const ctx = this._createKktpContext(true);
    const { discovery } = await ctx.protocol.createDiscoveryAnchor(meta);

    this._kktpPendingDiscoveries.set(discovery.sid, {
      ...ctx,
      discovery,
      createdAt: Date.now(),
    });

    const payload = `KKTP:ANCHOR:${canonicalize(discovery)}`;
    const address = toAddress ?? (await this.identity.getReceiveAddress());

    await this.send({
      toAddress: address,
      amount,
      payload,
    });

    return { discovery, payload };
  }

  /**
   * Respond to a discovery anchor and establish a session as responder.
   * @param {Object} discoveryAnchor - The peer's discovery anchor
   * @param {Object} [options] - { amount, toAddress }
   */
  async connectToPeer(discoveryAnchor, options = {}) {
    const { amount = "0.001", toAddress } = options;

    const ctx = this._createKktpContext(false);
    const { response } = await ctx.protocol.createResponseAnchor(discoveryAnchor);

    const mailboxId = ctx.protocol.sm.kktp.mailboxId;
    this._kktpSessions.set(mailboxId, {
      ...ctx,
      discovery: discoveryAnchor,
      response,
      createdAt: Date.now(),
    });

    const payload = `KKTP:ANCHOR:${canonicalize(response)}`;
    const address = toAddress ?? (await this.identity.getReceiveAddress());

    await this.send({
      toAddress: address,
      amount,
      payload,
    });

    return { response, mailboxId, payload };
  }

  /**
   * Send an encrypted KKTP message for a specific mailbox.
   * @param {string} mailboxId - Mailbox ID
   * @param {string} plaintext - Message plaintext
   * @param {Object} [options] - { amount, toAddress }
   */
  async sendMessage(mailboxId, plaintext, options = {}) {
    const { amount = "0.001", toAddress } = options;

    const session = this._kktpSessions.get(mailboxId);
    if (!session) {
      throw new Error(`KaspaPortal: No KKTP session for mailboxId ${mailboxId}`);
    }

    const canonicalMessage = session.protocol.createMessageAnchor(plaintext);
    const payload = `KKTP:${mailboxId}:${canonicalMessage}`;
    const address = toAddress ?? (await this.identity.getReceiveAddress());

    await this.send({
      toAddress: address,
      amount,
      payload,
    });

    return { payload };
  }

  /**
   * Get active KKTP sessions.
   * @returns {Array<Object>} Session contexts with mailboxId
   */
  getSessions() {
    return Array.from(this._kktpSessions.entries()).map(([mailboxId, session]) => ({
      mailboxId,
      ...session,
    }));
  }
}

// Instantiate it once here
export const kaspaPortal = new KaspaPortal();
