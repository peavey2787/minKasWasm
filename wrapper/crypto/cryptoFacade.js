import initKaspa from '../../kas-wasm/kaspa.js';
import { encryptMessage, decryptMessage } from './encryption.js';
import { DHSession } from './dh_encryption.js';

/**
 * Facade for cryptographic operations including Symmetric Encryption and Diffie-Hellman Key Exchange.
 * Provides a unified interface for encryption tasks within the application.
 */
export class CryptoFacade {
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
   * @returns {DHSession} A new instance of DHSession.
   */
  createDHSession() {
    return new DHSession();
  }
}