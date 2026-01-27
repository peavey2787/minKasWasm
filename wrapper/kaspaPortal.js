import { KKTPProtocol } from "../kktp/protocol/kktpProtocol.js";
import {
  canonicalize,
  prepareForSigning,
} from "../kktp/protocol/integrity/canonical.js";
import {
  discoveryValidator,
  responseValidator,
  sessionEndValidator,
} from "../kktp/protocol/integrity/validator.js";
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

  // RPC Runner

  /**
   * Run an arbitrary RPC command using the connected client.
   * @param {string|Object} cmd - JSON string or object with {method, params}
   * @returns {Promise<any>}
   */
  async runRpcCommand(cmd) {
    if (!this.transport?.client) throw new Error("Not connected");
    // Accept both string and object
    let cmdText = typeof cmd === "string" ? cmd : JSON.stringify(cmd);
    return await this.transport.runRpcCommand(cmdText);
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

  /**
   * List all wallet filenames (delegates to Identity).
   * @returns {Promise<string[]>}
   */
  async getAllWallets() {
    return await this.identity.getAllWallets();
  }

  /**
   * Generate a new receiving address (delegates to Identity).
   * @returns {Promise<string>}
   */
  async generateNewAddress() {
    return await this.identity.generateNewAddress();
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
   * Get all matching transactions from in-memory indexer.
   * @returns {Array} Array of matching transactions.
   */
  getAllMatchingTransactions() {
    this._ensureIntelligence();
    return this.intelligence.indexer?.getAllMatchingTransactions() || [];
  }

  /**
   * Get all matching transactions from IndexedDB cache.
   * @returns {Promise<Array>} Array of cached matching transactions.
   */
  async getAllCachedMatchingTransactions() {
    this._ensureIntelligence();
    return await (this.intelligence.indexer?.getAllCachedMatchingTransactions() ||
      Promise.resolve([]));
  }

  /**
   * Set the scanner prefix for payload matching.
   * @param {string} prefix - The prefix to match.
   */
  setScannerPrefix(prefix) {
    this._ensureIntelligence();
    if (this.intelligence.scanner) {
      this.intelligence.scanner.prefix = prefix;
    }
  }

  /**
   * Get the current scanner prefix.
   * @returns {string|null}
   */
  getScannerPrefix() {
    return this.intelligence?.scanner?.prefix || null;
  }

  /**
   * Sync indexer from a specific block hash to present.
   * @param {string} startHash
   * @param {function} [logFn]
   * @param {Object} [options]
   * @param {number} [options.maxSeconds=30]
   * @param {number} [options.minTimestamp=0]
   * @param {string[]} [options.prefixes] - Plain-text prefixes to match (hex-encoded internally)
   * @param {function|function[]} [options.onBlock] - Callback(s) for each block
   * @param {function|function[]} [options.onTransactionMatch] - Callback(s) for prefix matches
   */
  async syncFrom(
    startHash,
    logFn = null,
    {
      maxSeconds = 30,
      minTimestamp = 0,
      prefixes = [],
      onBlock = [],
      onTransactionMatch = [],
    } = {},
  ) {
    this._ensureIntelligence();
    return await this.intelligence.syncFrom(startHash, logFn, {
      maxSeconds,
      minTimestamp,
      prefixes,
      onBlock,
      onTransactionMatch,
    });
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
  async getKaspaBlocks(n) {
    return await this.vrf.getKaspaBlocks(n);
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
   * @returns {Promise<string>} Folded result hex
   */
  async generateFullRandomness() {
    const result = await this.vrf.generateFoldedEntropy({
      btcBlocks: 1,
      kasBlocks: 1,
      iterations: 2,
    });
    return result.finalOutput;
  }

  /**
   * Generate partial randomness using Kaspa + BTC only (no QRNG).
   * @returns {Promise<string>} Folded result hex
   */
  async generatePartialRandomness() {
    const result = await this.vrf.generatePartialEntropy({
      btcBlocks: 3,
      kasBlocks: 6,
      iterations: 3,
    });
    return result.finalOutput;
  }

  // --- KKTP Convenience Methods ---

  /**
   * Broadcast a signed discovery anchor and register as pending.
   * @param {Object} meta - Discovery meta object
   * @param {Object} [options] - { amount, toAddress }
   */
  async broadcastDiscovery(meta, options = {}) {
    const { amount = "1", toAddress } = options;

    const ctx = this._createKktpContext(true);
    const { discovery } = await ctx.protocol.createDiscoveryAnchor(meta);

    this._kktpPendingDiscoveries.set(discovery.sid, {
      ...ctx,
      discovery,
      createdAt: Date.now(),
    });

    const payload = this._buildAnchorPayload(discovery);
    const address = toAddress ?? (await this.identity.address);

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
    const { amount = "1", toAddress } = options;

    const ctx = this._createKktpContext(false);
    const { response } =
      await ctx.protocol.createResponseAnchor(discoveryAnchor);

    const mailboxId = ctx.protocol.sm.kktp.mailboxId;
    this._kktpSessions.set(mailboxId, {
      ...ctx,
      discovery: discoveryAnchor,
      response,
      messages: [],
      peerPubSig: discoveryAnchor.pub_sig,
      isInitiator: false,
      createdAt: Date.now(),
    });

    const payload = this._buildAnchorPayload(response);
    const address = toAddress ?? (await this.identity.address);

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
    const { amount = "1", toAddress } = options;

    const session = this._kktpSessions.get(mailboxId);
    if (!session) {
      throw new Error(
        `KaspaPortal: No KKTP session for mailboxId ${mailboxId}`,
      );
    }

    const canonicalMessage = session.protocol.createMessageAnchor(plaintext);
    const payload = `KKTP:${mailboxId}:${canonicalMessage}`;
    const address = toAddress ?? (await this.identity.address);

    await this.send({
      toAddress: address,
      amount,
      payload,
    });

    session.messages = session.messages || [];
    session.messages.push({
      id: crypto.randomUUID(),
      direction: session.sm.isInitiator ? "AtoB" : "BtoA",
      plaintext,
      timestamp: Date.now(),
      status: "pending",
      isOutbound: true,
    });

    return { payload };
  }

  /**
   * Process an incoming KKTP payload (anchor or message).
   * @param {string} rawPayload
   * @returns {Promise<Object|null>}
   */
  async processIncomingPayload(rawPayload) {
    const parsed = this._parseKKTPPayload(rawPayload);
    if (!parsed) return null;

    if (parsed.type === "anchor") {
      return await this._handleIncomingAnchor(parsed.anchor);
    }

    if (parsed.type === "message") {
      return this._handleIncomingMessage(parsed.mailboxId, parsed.message);
    }

    return null;
  }

  /**
   * Close and remove a KKTP session by mailboxId.
   * @param {string} mailboxId
   * @returns {boolean}
   */
  closeSession(mailboxId) {
    const session = this._kktpSessions.get(mailboxId);
    if (!session) return false;
    session.sm.terminate();
    this._kktpSessions.delete(mailboxId);
    return true;
  }

  /**
   * Get active KKTP sessions.
   * @returns {Array<Object>} Session contexts with mailboxId
   */
  getSessions() {
    return Array.from(this._kktpSessions.entries()).map(
      ([mailboxId, session]) => ({
        mailboxId,
        ...session,
      }),
    );
  }

  /**
   * Prepares a KKTP anchor for verification via KKTP Protocol.
   */
  prepareForVerification(anchor) {
    return this.kktpProtocol.prepareForVerification(anchor);
  }

  /**
   * RFC 8785 (JCS) Canonicalization via KKTP Protocol.
   */
  canonicalize(obj) {
    return this.kktpProtocol.canonicalize(obj);
  }

  /**
   * EXPOSED FOR AUDITORS:
   * Converts an object to plain JSON (no methods, no prototypes)
   */
  toPlainJson(value) {
    return this.kktpProtocol.toPlainJson(value);
  }

  _createKktpContext(isInitiator) {
    const keyIndex = this._kktpKeyIndex++;
    const sm = new KKTPStateMachine(this, isInitiator, keyIndex);
    const protocol = new KKTPProtocol(sm);
    return { sm, protocol, keyIndex };
  }

  _buildAnchorPayload(anchor) {
    return `KKTP:ANCHOR:${canonicalize(anchor)}`;
  }

  _parseKKTPPayload(rawPayload) {
    if (!rawPayload || !rawPayload.startsWith("KKTP:")) {
      return null;
    }

    if (rawPayload.startsWith("KKTP:ANCHOR:")) {
      const jsonStr = rawPayload.substring("KKTP:ANCHOR:".length);
      try {
        const anchor = JSON.parse(jsonStr);
        return { type: "anchor", anchor };
      } catch {
        return null;
      }
    }

    const parts = rawPayload.split(":");
    if (parts.length >= 3) {
      const mailboxId = parts[1];
      const jsonStr = parts.slice(2).join(":");
      try {
        const message = JSON.parse(jsonStr);
        return { type: "message", mailboxId, message };
      } catch {
        return null;
      }
    }

    return null;
  }

  async _verifyAnchorSignature(anchor) {
    const isResponse = anchor.type === "response";
    const sigField = isResponse ? "sig_resp" : "sig";
    const pubKeyField = isResponse ? "pub_sig_resp" : "pub_sig";

    const signature = anchor[sigField];
    const pubKey = anchor[pubKeyField];

    if (!signature || !pubKey) return false;

    const body = canonicalize(
      prepareForSigning(anchor, {
        omitKeys: [sigField],
        excludeMeta: anchor.type === "discovery",
      }),
    );

    return await this.crypto.verifyMessage(pubKey, body, signature);
  }

  async _handleIncomingAnchor(anchor) {
    if (anchor.type === "discovery") {
      discoveryValidator.validate(anchor);
    } else if (anchor.type === "response") {
      responseValidator.validate(anchor);
    } else if (anchor.type === "session_end") {
      sessionEndValidator.validate(anchor);
    } else {
      throw new Error(`Unknown anchor type: ${anchor.type}`);
    }

    const isValidSig = await this._verifyAnchorSignature(anchor);
    if (!isValidSig) {
      throw new Error("Invalid anchor signature");
    }

    if (anchor.type === "discovery") {
      return { type: "discovery", anchor };
    }

    if (anchor.type === "response") {
      const pending = this._kktpPendingDiscoveries.get(anchor.sid);
      if (pending && anchor.initiator_pub_sig === pending.discovery.pub_sig) {
        await pending.protocol.processIncoming(anchor);

        const mailboxId = pending.sm.kktp.mailboxId;
        this._kktpSessions.set(mailboxId, {
          ...pending,
          response: anchor,
          messages: [],
          peerPubSig: anchor.pub_sig_resp,
          isInitiator: true,
          createdAt: Date.now(),
        });

        this._kktpPendingDiscoveries.delete(anchor.sid);
        return { type: "session_established", mailboxId, response: anchor };
      }

      return { type: "response", anchor };
    }

    if (anchor.type === "session_end") {
      const sessionEntry = Array.from(this._kktpSessions.entries()).find(
        ([, s]) => s?.discovery?.sid === anchor.sid,
      );
      if (sessionEntry) {
        const [mailboxId, session] = sessionEntry;
        session.sm.terminate();
        this._kktpSessions.delete(mailboxId);
        return { type: "session_end", mailboxId, reason: anchor.reason };
      }
      return { type: "session_end", mailboxId: null, reason: anchor.reason };
    }

    return null;
  }

  _handleIncomingMessage(mailboxId, msgObject) {
    const session = this._kktpSessions.get(mailboxId);
    if (!session) {
      return { type: "message_ignored", mailboxId };
    }

    const plaintexts = session.sm.receiveMessage(msgObject);
    if (plaintexts && plaintexts.length > 0) {
      session.messages = session.messages || [];
      for (const plaintext of plaintexts) {
        session.messages.push({
          id: crypto.randomUUID(),
          direction: msgObject.direction,
          plaintext,
          timestamp: Date.now(),
          status: "confirmed",
          isOutbound: false,
        });
      }
    }

    return { type: "messages", mailboxId, messages: plaintexts || [] };
  }
}

// Instantiate it once here
export const kaspaPortal = new KaspaPortal();
