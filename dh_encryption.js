// DHSessions.js
import sodium from "libsodium-wrappers";
import {
  encryptXChaCha20Poly1305,
  decryptXChaCha20Poly1305
} from "../kas-wasm/kaspa.js";

/**
 * Diffie–Hellman Session Manager
 * Handles handshake, shared secret derivation, and message encryption/decryption.
 */
export class DHSession {
  constructor(myPrivateKey, myPublicKey) {
    if (!myPrivateKey || !myPublicKey) {
      throw new Error("DHSession requires both private and public keys");
    }
    this.myPrivateKey = myPrivateKey;
    this.myPublicKey = myPublicKey;
    this.sharedSecret = null;
    this.sessionKey = null;
    this.peerPublicKey = null;
  }

  /**
   * Initiate handshake: send your public key bytes
   */
  initiateHandshake() {
    return {
      type: "DH_INIT",
      publicKey: Buffer.from(this.myPublicKey).toString("hex"),
      timestamp: Date.now()
    };
  }

  /**
   * Respond to handshake: accept peer public key and derive shared secret
   */
  async respondToHandshake(peerPublicKeyHex) {
    await sodium.ready;
    this.peerPublicKey = Buffer.from(peerPublicKeyHex, "hex");

    // Derive shared secret using scalar multiplication
    this.sharedSecret = sodium.crypto_scalarmult(
      this.myPrivateKey,
      this.peerPublicKey
    );

    // Derive session key (hash the shared secret)
    this.sessionKey = sodium.crypto_generichash(32, this.sharedSecret);
    return {
      type: "DH_ACK",
      publicKey: Buffer.from(this.myPublicKey).toString("hex"),
      timestamp: Date.now()
    };
  }

  /**
   * Finalize handshake: compute shared secret after receiving peer ACK
   */
  async finalizeHandshake(peerPublicKeyHex) {
    await sodium.ready;
    this.peerPublicKey = Buffer.from(peerPublicKeyHex, "hex");

    this.sharedSecret = sodium.crypto_scalarmult(
      this.myPrivateKey,
      this.peerPublicKey
    );
    this.sessionKey = sodium.crypto_generichash(32, this.sharedSecret);
  }

  /**
   * Encrypt a message with the session key
   */
  encryptMessage(plaintext) {
    if (!this.sessionKey) throw new Error("Session not established");
    return encryptXChaCha20Poly1305(plaintext, Buffer.from(this.sessionKey).toString("hex"));
  }

  /**
   * Decrypt a message with the session key
   */
  decryptMessage(cipherText) {
    if (!this.sessionKey) throw new Error("Session not established");
    return decryptXChaCha20Poly1305(cipherText, Buffer.from(this.sessionKey).toString("hex"));
  }
}