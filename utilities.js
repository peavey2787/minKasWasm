import { bech32 } from "https://cdn.jsdelivr.net/npm/bech32@2.0.0/+esm";
import * as secp from "https://esm.sh/@noble/secp256k1";
import {  XPrv, Mnemonic } from './kas-wasm/kaspa.js';
import { loadWalletData } from './storage.js';

const MAX_PAYLOAD_BYTES = 32 * 1024; // 32KB
const KASPA_DERIVATION_PATH = "m/44'/111111'/0'/0/0";

export function generateMnemonic(wordCount = 24) {
  const mnemonic = Mnemonic.random(wordCount);
  return mnemonic.phrase;
}

export function stringToHex(str) {
  // Convert a JS string to a hex-encoded byte string (UTF-8)
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToString(hex) {
  // Remove optional "0x" prefix
  if (hex.startsWith("0x")) hex = hex.slice(2);

  // Convert hex → bytes → UTF‑8 string
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );

  return new TextDecoder().decode(bytes);
}

export function validatePayload(payload) {
  if (typeof payload !== 'string') return false;
  if (payload.length > MAX_PAYLOAD_BYTES * 2) return false;
  return true;
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

export async function getXPrvFromStorage(filename, masterPassword) {
  const walletData = await loadWalletData(filename, masterPassword);
  const xPrv = XPrv.fromXPrv(walletData.xprv);
  return xPrv;
}

export function getXPrv(mnemonicPhrase, passphrase = null) {
  const seed = passphrase
    ? new Mnemonic(mnemonicPhrase).toSeed(passphrase)
    : new Mnemonic(mnemonicPhrase).toSeed();
  const xPrv = new XPrv(seed);
  return xPrv;
}

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

export function deriveChildPrivateKey(xprv, index) {
  if (typeof index !== "number" || index < 0) {
    throw new Error("Index must be a non-negative integer");
  }
  const childXPrv = xprv.deriveChild(index);
  return childXPrv.toPrivateKey();
}

export function getPublicKeyBytes(prvKeyHex) {
  const prvKeyBytes = hexToBytes(prvKeyHex);
  const pubKeyBytes = secp.getPublicKey(prvKeyBytes, true); // compressed
  return pubKeyBytes;
}

export function getPublicKeyHex(prvKeyBytes) {
  const pubKeyBytes = getPublicKeyBytes(prvKeyBytes);
  return bytesToHex(pubKeyBytes);
}

/*export function getPublicKeyBytes(privateKey) {
  const publicKey = privateKey.toXPub();
  return decodeKaspaBech32PubKey(publicKey.xpub);
}

export function decodeKaspaBech32PubKey(kpub) {
  const { words } = bech32.decode(kpub);
  // Kaspa uses 5-bit words, convert to 8-bit bytes
  return Uint8Array.from(bech32.fromWords(words));
}*/