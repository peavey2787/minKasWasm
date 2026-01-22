// kktp/types/crypto.ts

export type HexString = string; // validated at runtime

// ---- Identity & signing (Ed25519) ----

export interface SigningKeyPair {
  pub_sig: HexString;  // public signing key
  priv_sig: HexString; // private signing key
}

// ---- Diffie-Hellman (X25519 or equivalent) ----

export interface DhKeyPair {
  pub_dh: HexString;   // public DH key
  priv_dh: HexString;  // private DH key
}

export interface DhSharedSecret {
  sharedSecret: Uint8Array; // raw shared secret bytes
}

// ---- HKDF-derived keys ----

export interface HkdfParams {
  ikm: Uint8Array;          // input keying material
  salt?: Uint8Array | null; // optional salt
  info?: Uint8Array | null; // optional context
  length: number;           // output length in bytes
}

export interface HkdfResult {
  okm: Uint8Array; // output keying material
}

// ---- AEAD (e.g., ChaCha20-Poly1305 / AES-GCM) ----

export interface AeadKey {
  key: Uint8Array; // symmetric key bytes
}

export interface AeadNonce {
  nonce: Uint8Array; // nonce/IV bytes
}

export interface AeadEncryptParams {
  key: AeadKey;
  nonce: AeadNonce;
  plaintext: Uint8Array;
  aad?: Uint8Array | null; // associated data
}

export interface AeadDecryptParams {
  key: AeadKey;
  nonce: AeadNonce;
  ciphertext: Uint8Array;
  aad?: Uint8Array | null;
}

export interface AeadEncryptResult {
  ciphertext: Uint8Array;
  tag?: Uint8Array; // if your AEAD exposes tag separately
}

// ---- VRF (if/when you wire it) ----

export interface VrfKeyPair {
  pub_vrf: HexString;
  priv_vrf: HexString;
}

export interface VrfProof {
  proof: Uint8Array;
}

export interface VrfOutput {
  output: Uint8Array;
}