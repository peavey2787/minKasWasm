import initKaspa from '../../kas-wasm/kaspa.js';
import { encryptMessage, decryptMessage } from './encryption.js';
import { DHSession } from './dh_encryption.js';

/**
 * Facade for cryptographic operations including Symmetric Encryption and Diffie-Hellman Key Exchange.
 * Provides a unified interface for encryption tasks within the application.
 */
export class CryptoFacade {
  /**
   * @param {Object} [identityFacade] - Optional reference to IdentityFacade for key derivation shortcuts.
   */
  constructor(identityFacade) {
    this.identity = identityFacade;
  }

  /**
   * Initialize the WASM environment.
   * This must be called before using any cryptographic functions if WASM hasn't been initialized elsewhere.
   * @returns {Promise<void>}
   */
  async init() {
    await initKaspa();
  }

  /**
   * Encrypt a message using a password (symmetric XChaCha20Poly1305).
   * @param {string} text - The plaintext message to encrypt.
   * @param {string} password - The password to use for encryption.
   * @returns {Object} The encrypted data object (e.g., { iv, data, salt }).
   */
  encrypt(text, password) {
    return encryptMessage(text, password);
  }

  /**
   * Decrypt a message using a password (symmetric XChaCha20Poly1305).
   * @param {Object|string} encrypted - The encrypted message object or JSON string.
   * @param {string} password - The password to use for decryption.
   * @returns {string} The decrypted plaintext.
   */
  decrypt(encrypted, password) {
    return decryptMessage(encrypted, password);
  }

  /**
   * Create a new Diffie-Hellman session for secure key exchange.
   * @param {string} [privateKey] - Optional private key to immediately initialize the session.
   * @param {string} [publicKey] - Optional public key (if not provided, derived from privateKey).
   * @returns {DHSession} A new instance of DHSession.
   */
  createDHSession(privateKey, publicKey) {
    const session = new DHSession();
    if (privateKey) {
      session.initiateHandshake(privateKey, publicKey);
    }
    return session;
  }

  /**
   * Derive a keypair using the active wallet identity.
   * @param {number} index - Child index.
   */
  async deriveKeypair(index) {
    if (!this.identity) throw new Error("CryptoFacade: IdentityFacade not available for key derivation.");
    return this.identity.generateNewKeypair(index);
  }
}