import initKaspa from "../kas-wasm/kaspa.js";
import { encryptMessage, decryptMessage } from "./encryption.js";
import { DHSession } from "./dh_encryption.js";
import {
  signMessageWithPrivateKeyHex,
  verifyMessageWithPublicKeyHex,
  deriveChildKeyPair,
} from "../utilities/utilities.js";
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
   * Generates the two distinct key sets.
   * @param {string} xprvHex - The master or account kprv
   * @param {number} index - The child index
   */
  async generateIdentityKeys(xprvHex, index) {
    // 1. Get raw Signing Keys (Branch 0)
    const sigRaw = await deriveChildKeyPair({ xprvHex, branch: 0, index });

    // 2. Get raw DH Keys (Branch 100)
    const dhRaw = await deriveChildKeyPair({ xprvHex, branch: 100, index });

    return {
      sig: {
        privateKey: sigRaw.privateKey,
        publicKey: sigRaw.publicKey, // 66 hex
      },
      dh: {
        privateKey: dhRaw.privateKey,
        publicKey: dhRaw.publicKey, // 66 hex (Compressed) to satisfy utilities.hexToBytes
      },
    };
  }

  /**
   * Return derived signing keys for the active account.
   * This avoids exposing walletSecret to callers.
   */
  async getDefaultSigningKeysForActiveAccount() {
    if (!walletInitialized || !wallet)
      throw new Error("Wallet not initialized. Call init() first.");
    if (!walletSecret)
      throw new Error("Wallet secret not set (create/open wallet first).");

    const accounts = await wallet.accountsEnumerate({});
    const active = accounts?.accountDescriptors?.[currentAccountIndex];
    if (!active) throw new Error("Active account not found.");

    // Your utilities derive functions accept "mainnet"/"testnet" (not "testnet-10")
    const netName = String(currentNetworkId || "")
      .toLowerCase()
      .startsWith("testnet")
      ? "testnet"
      : "mainnet";

    const xprv = await utilities.getXPrvFromStorage(filename, walletSecret);
    const xprvHex = xprv.toString();

    const receive0 = await utilities.deriveReceivingChildKeyPair({
      xprvHex,
      network: netName,
      accountIndex: BigInt(currentAccountIndex),
      index: 0,
    });

    // If you added deriveChangeChildKeyPair earlier, use it; otherwise add it to utilities.js.
    const change0 = await utilities.deriveChangeChildKeyPair({
      xprvHex,
      network: netName,
      accountIndex: BigInt(currentAccountIndex),
      index: 0,
    });

    return {
      receive: receive0, // { privateKey, publicKey, address }
      change: change0, // { privateKey, publicKey, address }
    };
  }

  /**
   * Generate a new keypair for the given index using the wallet's XPrv.
   * @param {number} index - The child index for key derivation.
   * @returns {Promise<{privateKey: string, publicKey: string}>} - The derived keypair.
   */
  async generateNewKeypair(index) {
    const xprv = await utilities.getXPrvFromStorage(filename, walletSecret);
    const xprvHex = xprv.toString();
    const derivedKeyPair = await utilities.deriveReceivingChildKeyPair({
      xprvHex,
      index,
    });
    return {
      privateKey: derivedKeyPair.privateKey,
      publicKey: derivedKeyPair.publicKey,
    };
  }

  /**
   * Section 5.1: Canonical Anchor Signing
   * Automatically handles canonicalization and field omission.
   */
  async signAnchor(anchor, privateKeyHex, isResponse = false) {
    const omitKeys = isResponse ? ["sig_resp"] : ["sig"];
    // Anchors exclude meta from the signature hash per Section 5.1
    const body = canonicalize(
      prepareForSigning(anchor, { omitKeys, excludeMeta: true }),
    );
    return await signMessageWithPrivateKeyHex(privateKeyHex, body);
  }

  /**
   * Verify a signed anchor using the provided public key.
   * @param {Object} anchor - The anchor object containing the signature.
   * @param {string} publicKeyHex - The public key in hex format.
   * @param {boolean} isResponse - Whether this is a response anchor (affects signature field).
   * @returns {Promise<boolean>} True if the signature is valid, false otherwise.
   */
  async signMessage(privateKeyHex, message) {
    return await signMessageWithPrivateKeyHex(privateKeyHex, message);
  }

  /**
   * Verify a signed message using a public key.
   * @param {string} publicKeyHex - The public key in hex format.
   * @param {string} message - The original message that was signed.
   * @param {string} signatureHex - The signature in hex format.
   * @returns {Promise<boolean>} True if the signature is valid, false otherwise.
   */
  async verifyMessage(publicKeyHex, message, signatureHex) {
    return await verifyMessageWithPublicKeyHex(
      publicKeyHex,
      message,
      signatureHex,
    );
  }
}
