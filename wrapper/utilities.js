import * as secp from "https://esm.sh/@noble/secp256k1";
import { signMessage, verifyMessage, XPrv, Mnemonic, PrivateKeyGenerator, PublicKeyGenerator, Address } from '../kas-wasm/kaspa.js';
import { loadWalletData } from './storage.js';

const MAX_PAYLOAD_BYTES = 32 * 1024; // 32KB
const NETWORK = "testnet";

/**
 * Generate a random BIP39 mnemonic phrase.
 * @param {number} [wordCount=24] - Number of words in the mnemonic.
 * @returns {string} The generated mnemonic phrase.
 */
export function generateMnemonic(wordCount = 24) {
  const mnemonic = Mnemonic.random(wordCount);
  return mnemonic.phrase;
}

/** Retrieve the mnemonic phrase from storage.
 * @param {string} filename - Wallet filename.
 * @param {string} masterPassword - Password to decrypt wallet data.
 * @returns {Promise<string>} The mnemonic phrase.
 */
export async function getMnemonicFromStorage(filename, masterPassword) {
  const walletData = await loadWalletData(filename, masterPassword);
  const mnemonic = walletData.mnemonic;
  return mnemonic;
}

/** * Validate and normalize a Kaspa address.
 * @param {string|Address} address - The address to validate.
 * @returns {Address} The validated Address object.
 * @throws {Error} If the address is invalid.
 */
export function validateAddress(address) {  
  if (address == null || address === '') {
    throw new Error('Invalid address: ' + address);
  }  
  if (typeof address === "string") {
    try{
      address = new Address(address);
      return address;
    } catch (err) {
      throw new Error('Invalid address format: ' + address);
    }
  }
  return address;
}

/**
 * Validate a payload string for Kaspa transaction (must be string and <= 32KB).
 * @param {string} payload - The payload string to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
export function validatePayload(payload) {
  if (typeof payload !== 'string') return false;
  if (payload.length > MAX_PAYLOAD_BYTES * 2) return false;
  return true;
}

/**
 * Convert a JS string to a hex-encoded byte string (UTF-8).
 * @param {string} str - The string to encode.
 * @returns {string} Hex-encoded string.
 */
export function stringToHex(str) {
  // Convert a JS string to a hex-encoded byte string (UTF-8)
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a hex-encoded string (UTF-8) to a JS string.
 * @param {string} hex - The hex string to decode.
 * @returns {string} Decoded string.
 */
export function hexToString(hex) {
  // Remove optional "0x" prefix
  if (hex.startsWith("0x")) hex = hex.slice(2);

  // Convert hex → bytes → UTF‑8 string
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );

  return new TextDecoder().decode(bytes);
}

/**
 * Convert a Uint8Array or array of bytes to a hex string.
 * @param {Uint8Array|Array<number>} bytes - The bytes to convert.
 * @returns {string} Hex string.
 */
export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert a hex string to a Uint8Array of bytes.
 * @param {string} hex - The hex string to convert.
 * @returns {Uint8Array} Byte array.
 */
export function hexToBytes(hex) {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.length !== 64 && hex.length !== 66) {
    throw new Error("Key must be 32 bytes (64 hex chars) or compressed secp256k1 public key (66 hex chars)");
  }
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return arr;
}

/**
 * Get the compressed public key bytes from a private key hex string.
 * @param {string} prvKeyHex - Private key as hex string.
 * @returns {Uint8Array} Compressed public key bytes.
 */
export function getPublicKeyBytes(prvKeyHex) {
  const prvKeyBytes = hexToBytes(prvKeyHex);
  const pubKeyBytes = secp.getPublicKey(prvKeyBytes, true); // compressed
  return pubKeyBytes;
}

/**
 * Get the compressed public key as a hex string from a private key hex string.
 * @param {string} prvKeyHex - Private key as hex string.
 * @returns {string} Compressed public key as hex string.
 */
export function getPublicKeyHex(prvKeyHex) {
  const pubKeyBytes = getPublicKeyBytes(prvKeyHex);
  return bytesToHex(pubKeyBytes);
}

/**
 * Load and return the XPrv object from storage.
 * @param {string} filename - Wallet filename.
 * @param {string} masterPassword - Password to decrypt wallet data.
 * @returns {Promise<XPrv>} The loaded XPrv object.
 */
export async function getXPrvFromStorage(filename, masterPassword) {
  const walletData = await loadWalletData(filename, masterPassword);
  const xPrv = XPrv.fromXPrv(walletData.xprv);
  return xPrv;
}

/**
 * Get the private key bytes from an XPrv instance or hex string.
 * @param {XPrv|string} xPrv - XPrv instance or hex string.
 * @returns {Uint8Array} Private key bytes.
 */
export function getPrivateKeyBytes(xPrv) {
  if (xPrv instanceof XPrv) {
    // xPrv.privateKey is a hex string
    return hexToBytes(xPrv.privateKey);
  }
  if (typeof xPrv === "string") {
    return hexToBytes(xPrv);
  }
  throw new TypeError("getPrivateKeyBytes requires an XPrv instance or hex string");
}

/**
 * Get the private key as a hex string from an XPrv, hex string, or Uint8Array.
 * @param {XPrv|string|Uint8Array} xPrv - XPrv, hex string, or byte array.
 * @returns {string} Private key as hex string.
 */
export function getPrivateKeyHex(xPrv) {
  if (xPrv instanceof XPrv) {
    return xPrv.privateKey;
  }
  if (typeof xPrv === "string") {
    return xPrv;
  }
  if (typeof xPrv === "Uint8Array") {
    return bytesToHex(xPrv);
  }
  throw new TypeError("getPrivateKeyHex requires an XPrv instance, hex string, or Uint8Array");
}

/**
 * Derive an XPrv from a mnemonic phrase and optional passphrase.
 * @param {string} mnemonicPhrase - BIP39 mnemonic phrase.
 * @param {string|null} [passphrase=null] - Optional passphrase.
 * @returns {XPrv} The derived XPrv object.
 */
export function getXPrv(mnemonicPhrase, passphrase = null) {
  const seed = passphrase
    ? new Mnemonic(mnemonicPhrase).toSeed(passphrase)
    : new Mnemonic(mnemonicPhrase).toSeed();
  const xPrv = new XPrv(seed);
  return xPrv;
}

// This network parameter can be "mainnet"/"testnet"
// or a NetworkType.MAINNET (1 = mainnet, 2 = testnet)
/**
 * Derive a receiving child key pair and address from an XPrv hex.
 * @param {Object} params
 * @param {string} params.xprvHex - Extended private key as hex string.
 * @param {string} [params.network=NETWORK] - Network name or ID.
 * @param {bigint} [params.accountIndex=0n] - Account index (BigInt).
 * @param {number} [params.index=0] - Child index.
 * @returns {Promise<{privateKey: string, publicKey: string, address: string}>} Key pair and address.
 */
export async function deriveReceivingChildKeyPair({xprvHex, network = NETWORK, accountIndex = 0n, index = 0}) {
  if (typeof index !== "number" || index < 0) {
    throw new Error("Index must be a non-negative integer");
  }

  // Generate private key
  const gen = new PrivateKeyGenerator(xprvHex, false, accountIndex);
  const privKey = gen.receiveKey(index);

  // Generate public key
  const pubKey = privKey.toPublicKey();

  // Generate address
  const pubGen = PublicKeyGenerator.fromMasterXPrv(xprvHex, false, accountIndex);
  const addr = pubGen.receiveAddressAsString(network, index);

  return {  privateKey: privKey.toString(), publicKey: pubKey.toString(), address: addr  };
}

/**
 * Sign a message with a private key hex string.
 * @param {string} privateKeyHex - Private key as hex string.
 * @param {string} message - Message to sign.
 * @returns {Promise<string>} Signature as hex string.
 */
export async function signMessageWithPrivateKeyHex(privateKeyHex, message) {
  const signature = await signMessage({privateKey: privateKeyHex, message});
  return signature; 
}

/**
 * Verify a message signature with a public key hex string.
 * @param {string} publicKeyHex - Public key as hex string.
 * @param {string} message - Message to verify.
 * @param {string} signatureHex - Signature as hex string.
 * @returns {Promise<boolean>} True if valid, false otherwise.
 */
export async function verifyMessageWithPublicKeyHex(publicKeyHex, message, signatureHex) {    
  const isValid = await verifyMessage({publicKey: publicKeyHex, message, signature: signatureHex});
  return isValid;
}