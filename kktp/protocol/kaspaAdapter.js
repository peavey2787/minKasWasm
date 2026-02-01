// kktp/protocol/kaspaAdapter.js
// Network Adapter Interface - Bridges KKTP components to KaspaPortal
// This abstraction allows swapping the underlying network (e.g., Kaspa → another chain)

/**
 * KaspaAdapter - Bridge between KKTP protocol components and KaspaPortal.
 *
 * All KKTP components should use this adapter instead of importing
 * kaspaPortal directly. This provides:
 * - Clean separation of concerns
 * - Testability (can mock the adapter)
 * - Single integration point
 * - Network-agnostic KKTP layer (swap this adapter for another chain)
 *
 * @example
 * ```javascript
 * // In SessionFacade constructor:
 * const adapter = new KaspaAdapter(kaspaPortal);
 *
 * // Pass to internal services:
 * const keyDeriver = new KeyDeriver({ adapter, persistence });
 * ```
 */
export class KaspaAdapter {
  /**
   * @param {import('../../wrapper/kaspaPortal.js').KaspaPortal} portal
   */
  constructor(portal) {
    if (!portal) {
      throw new Error("KaspaAdapter: portal instance is required");
    }
    this._portal = portal;
  }

  // ═══════════════════════════════════════════════════════════════
  // LIFECYCLE & STATE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if the underlying network is connected and ready.
   * @returns {boolean}
   */
  get isReady() {
    return this._portal.isReady;
  }

  /**
   * Get the current wallet address (sync getter).
   * @returns {string|null}
   */
  get address() {
    return this._portal.address;
  }

  /**
   * Get the current wallet address (async method for consistency).
   * @returns {Promise<string|null>}
   */
  async getAddress() {
    return this._portal.address;
  }

  /**
   * Check if the wallet is initialized.
   * @returns {boolean}
   */
  get isWalletInitialized() {
    return this._portal.wallet?.walletInitialized ?? false;
  }

  // ═══════════════════════════════════════════════════════════════
  // IDENTITY & KEY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate signing and DH key pairs for KKTP identity.
   * @param {number} index - Derivation index
   * @returns {Promise<{sig: {publicKey: string, privateKey: string}, dh: {publicKey: string, privateKey: string}}>}
   */
  async generateIdentityKeys(index) {
    return await this._portal.generateIdentityKeys(index);
  }

  // ═══════════════════════════════════════════════════════════════
  // CRYPTOGRAPHY
  // ═══════════════════════════════════════════════════════════════

  /**
   * Sign a message with a private key.
   * @param {string} privateKeyHex - Private key as hex string
   * @param {string} message - Message to sign
   * @returns {Promise<string>} Signature
   */
  async signMessage(privateKeyHex, message) {
    return await this._portal.signMessage(privateKeyHex, message);
  }

  /**
   * Verify a message signature.
   * @param {string} publicKey - Public key
   * @param {string} body - Original message
   * @param {string} signature - Signature to verify
   * @returns {Promise<boolean>} True if valid
   */
  async verifyMessage(publicKey, body, signature) {
    return await this._portal.verifyMessage(publicKey, body, signature);
  }

  /**
   * Start a Diffie-Hellman session for encrypted communication.
   * @param {number} keyIndex - Derivation index
   * @param {string} [privateKey] - Existing private key (optional)
   * @returns {Promise<Object>} DH session with deriveSharedSecret method
   */
  async startSession(keyIndex, privateKey) {
    return await this._portal.startSession(keyIndex, privateKey);
  }

  // ═══════════════════════════════════════════════════════════════
  // VRF & RANDOMNESS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate high-quality randomness from QRNG, Bitcoin, and Kaspa.
   * @returns {Promise<string>} 64-character hex string
   */
  async generateFullRandomness() {
    return await this._portal.generateFullRandomness();
  }

  /**
   * Generate randomness from Bitcoin and Kaspa only (no QRNG).
   * Use as fallback when QRNG is unavailable.
   * @returns {Promise<string>} 64-character hex string
   */
  async generatePartialRandomness() {
    return await this._portal.generatePartialRandomness();
  }

  /**
   * Generate a verifiable random proof using blockchain entropy.
   * @param {Object} options - VRF options
   * @param {string} options.seedInput - Seed value
   * @returns {Promise<{finalOutput: string, proof: Object}>}
   */
  async prove(options) {
    return await this._portal.prove(options);
  }

  /**
   * Verify a VRF proof.
   * @param {string|Object} valueOrResult - Value or result object to verify
   * @param {Object} [optionalProof] - Proof if not included in first param
   * @param {string} [expectedInput] - Expected VRF input for validation
   * @returns {Promise<boolean>} True if valid
   */
  async verify(valueOrResult, optionalProof, expectedInput) {
    return await this._portal.verify(valueOrResult, optionalProof);
  }

  // ═══════════════════════════════════════════════════════════════
  // TRANSACTION & BROADCASTING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Send a transaction with a payload.
   * @param {Object} options - Transaction options
   * @param {string} options.toAddress - Destination address
   * @param {string} [options.amount='1'] - Amount in KAS
   * @param {string} [options.payload] - OP_RETURN payload
   * @returns {Promise<Object>} Transaction result
   */
  async send(options) {
    return await this._portal.send(options);
  }

  /**
   * Broadcast a KKTP anchor to the network.
   * @param {Object} anchor - KKTP anchor object
   * @param {Object} [options] - Broadcast options
   * @param {string} [options.toAddress] - Destination address (defaults to self)
   * @param {string} [options.amount='1'] - Transaction amount
   * @returns {Promise<Object>} Transaction result
   */
  async broadcastAnchor(anchor, options = {}) {
    const { toAddress, amount = "1" } = options;
    const payload = `KKTP:ANCHOR:${JSON.stringify(anchor)}`;
    const address = toAddress ?? this.address;

    return await this.send({
      toAddress: address,
      amount,
      payload,
    });
  }

  /**
   * Broadcast a mailbox message to the network.
   * @param {string} mailboxId - Session mailbox ID
   * @param {string} canonicalMessage - Canonical JSON message
   * @param {Object} [options] - Broadcast options
   * @param {string} [options.toAddress] - Destination address
   * @param {string} [options.amount='1'] - Transaction amount
   * @returns {Promise<Object>} Transaction result
   */
  async broadcastMessage(mailboxId, canonicalMessage, options = {}) {
    const { toAddress, amount = "1" } = options;
    const payload = `KKTP:${mailboxId}:${canonicalMessage}`;
    const address = toAddress ?? this.address;

    // Validate payload size (Section 6.4: ~32 KB limit)
    if (new TextEncoder().encode(payload).length > 32000) {
      throw new Error(
        "KKTP: Payload exceeds Kaspa limits. Application-layer chunking required.",
      );
    }

    return await this.send({
      toAddress: address,
      amount,
      payload,
    });
  }

  /**
   * Broadcast a group message to the network.
   * @param {string} groupMailboxId - Group mailbox ID
   * @param {Object} encrypted - Encrypted message object
   * @param {Object} [options] - Broadcast options
   * @returns {Promise<Object>} Transaction result
   */
  async broadcastGroupMessage(groupMailboxId, encrypted, options = {}) {
    const { toAddress, amount = "1" } = options;
    const payload = `KKTP:GROUP:${groupMailboxId}:${JSON.stringify(encrypted)}`;
    const address = toAddress ?? this.address;

    return await this.send({
      toAddress: address,
      amount,
      payload,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SCANNER & PREFIX MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add a payload prefix to watch for on the blockchain.
   * @param {string} prefix - Prefix to match (e.g., 'KKTP:abc123...')
   */
  addPrefix(prefix) {
    this._portal.addPrefix?.(prefix);
  }

  /**
   * Remove a prefix from the watch list.
   * @param {string} prefix - Prefix to stop watching
   */
  removePrefix(prefix) {
    this._portal.removePrefix?.(prefix);
  }

  /**
   * Set a single scanner prefix.
   * @param {string} prefix - Prefix to match
   */
  setScannerPrefix(prefix) {
    this._portal.setScannerPrefix?.(prefix);
  }

  /**
   * Get the current scanner prefix.
   * @returns {string|null}
   */
  getScannerPrefix() {
    return this._portal.getScannerPrefix?.() || null;
  }

  // ═══════════════════════════════════════════════════════════════
  // BLOCKCHAIN SYNC & SEARCH
  // ═══════════════════════════════════════════════════════════════

  /**
   * Sync the indexer from a starting block to the present.
   * @param {string} startHash - Block hash to start from
   * @param {Function} [logFn] - Logging callback
   * @param {Object} [options] - Sync options
   * @returns {Promise<void>}
   */
  async syncFrom(startHash, logFn = null, options = {}) {
    return await this._portal.syncFrom(startHash, logFn, options);
  }

  /**
   * Search forward from a block for matching payloads.
   * @param {string} startHash - Starting block hash
   * @param {string} searchText - Text to find in payloads
   * @param {string} [mode='contains'] - Match mode
   * @param {Object} [options] - Search options
   * @returns {Promise<Array>} Array of matches
   */
  async findPayload(startHash, searchText, mode = "contains", options = {}) {
    return await this._portal.findPayload(startHash, searchText, mode, options);
  }

  /**
   * Search backward through history for matching transactions.
   * @param {string} startHash - Starting block hash
   * @param {Function} matchFn - Match function
   * @param {Object} [options] - Search options
   * @returns {Promise<Array>} Array of matches
   */
  async findHistorical(startHash, matchFn, options = {}) {
    return await this._portal.findHistorical(startHash, matchFn, options);
  }
}
