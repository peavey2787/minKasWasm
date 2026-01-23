import { blake2b } from 'https://esm.sh/@noble/hashes@1.3.3/blake2b';
import { hkdf } from 'https://esm.sh/@noble/hashes@1.3.3/hkdf';
import * as ed from 'https://esm.sh/@noble/ed25519@1.7.3';
import { xchacha20poly1305 } from 'https://esm.sh/@noble/ciphers@0.4.0/chacha';
export { bytesToHex, hexToBytes } from 'https://esm.sh/@noble/hashes@1.3.3/utils';
import { bytesToHex, hexToBytes } from 'https://esm.sh/@noble/hashes@1.3.3/utils';

// --- Canonical JSON (RFC 8785 subset) ---
export function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map(key => {
    const val = canonicalStringify(obj[key]);
    return `${JSON.stringify(key)}:${val}`;
  });
  return `{${parts.join(',')}}`;
}

// --- Helpers ---
function randomBytes(n) {
  return window.crypto.getRandomValues(new Uint8Array(n));
}

function hash(data) {
  return blake2b(data, { dkLen: 32 });
}

// --- Key Management ---
export async function generateIdentityKey() {
  const priv = ed.utils.randomPrivateKey();
  const pub = await ed.getPublicKey(priv);
  return { priv: bytesToHex(priv), pub: bytesToHex(pub) };
}

export async function generateSessionKey() {
  const priv = ed.utils.randomPrivateKey();
  const pub = await ed.getPublicKey(priv);
  return { priv: bytesToHex(priv), pub: bytesToHex(pub) };
}

// --- Anchors ---
export async function createDiscoveryAnchor(sid, identityKey, sessionKey, meta = {}, vrfValue = null) {
  const anchor = {
    type: "discovery",
    version: 1,
    sid,
    pub_sig: identityKey.pub,
    pub_dh: sessionKey.pub,
    vrf_value: vrfValue,
    vrf_proof: null,
    meta
  };
  
  const payload = new TextEncoder().encode(canonicalStringify(anchor));
  const sig = await ed.sign(payload, identityKey.priv);
  anchor.sig = bytesToHex(sig);
  
  return anchor;
}

export async function createResponseAnchor(discoveryAnchor, identityKey, sessionKey, vrfValue = null) {
  const anchor = {
    type: "response",
    version: 1,
    sid: discoveryAnchor.sid,
    initiator_pub_sig: discoveryAnchor.pub_sig,
    initiator_pub_dh: discoveryAnchor.pub_dh,
    pub_sig_resp: identityKey.pub,
    pub_dh_resp: sessionKey.pub,
    vrf_value: vrfValue || discoveryAnchor.vrf_value,
    vrf_proof: null
  };

  const payload = new TextEncoder().encode(canonicalStringify(anchor));
  const sig = await ed.sign(payload, identityKey.priv);
  anchor.sig_resp = bytesToHex(sig);

  return anchor;
}

export async function createSessionEndAnchor(sid, identityKey, reason = "Game Over") {
  const anchor = {
    type: "session_end",
    version: 1,
    sid,
    pub_sig: identityKey.pub,
    reason
  };
  const payload = new TextEncoder().encode(canonicalStringify(anchor));
  const sig = await ed.sign(payload, identityKey.priv);
  anchor.sig = bytesToHex(sig);
  return anchor;
}

// --- Session Derivation ---
export async function deriveSessionSecrets(isInitiator, myPrivDh, peerPubDh, sid, pubSigA, pubSigB) {
  const privBytes = hexToBytes(myPrivDh);
  const pubBytes = hexToBytes(peerPubDh);
  const shared = await ed.getSharedSecret(privBytes, pubBytes);
  
  const salt = new TextEncoder().encode(sid);
  // Info: A's pub_sig || B's pub_sig_resp
  const info = new Uint8Array([...hexToBytes(pubSigA), ...hexToBytes(pubSigB)]);
  
  const kSession = hkdf(blake2b, shared, salt, info, 32);
  
  // Mailbox ID: H(pub_sig || pub_sig_resp || sid)
  const mailboxInput = new Uint8Array([...hexToBytes(pubSigA), ...hexToBytes(pubSigB), ...new TextEncoder().encode(sid)]);
  const mailboxId = bytesToHex(hash(mailboxInput));

  return { kSession, mailboxId };
}

export function derivePublicSessionSecrets(vrfValueHex, sid, pubSigA, pubSigB) {
  // In public mode, the VRF output acts as the shared secret
  const shared = hexToBytes(vrfValueHex);
  
  const salt = new TextEncoder().encode(sid);
  const info = new Uint8Array([...hexToBytes(pubSigA), ...hexToBytes(pubSigB)]);
  
  const kSession = hkdf(blake2b, shared, salt, info, 32);
  
  const mailboxInput = new Uint8Array([...hexToBytes(pubSigA), ...hexToBytes(pubSigB), ...new TextEncoder().encode(sid)]);
  const mailboxId = bytesToHex(hash(mailboxInput));

  return { kSession, mailboxId };
}

// --- Encryption/Decryption ---
export function encryptMessage(kSession, mailboxId, direction, seq, plaintextObj) {
  if (typeof mailboxId !== 'string') {
    throw new Error(`encryptMessage: mailboxId must be a hex string, got ${typeof mailboxId} (${mailboxId})`);
  }

  const nonce = randomBytes(24); // 192-bit
  const plaintext = new TextEncoder().encode(canonicalStringify(plaintextObj));
  
  // AAD: mailbox_id (bytes) || direction (utf8) || seq (u64be)
  const dirBytes = new TextEncoder().encode(direction);
  const seqBytes = new Uint8Array(8);
  new DataView(seqBytes.buffer).setBigUint64(0, BigInt(seq), false); // BigEndian
  
  const aad = new Uint8Array([...hexToBytes(mailboxId), ...dirBytes, ...seqBytes]);
  
  const ciphertext = xchacha20poly1305(kSession, nonce, aad).encrypt(plaintext);
  
  return {
    type: "msg",
    version: 1,
    sid: plaintextObj.sid || "", // Helper: extract sid from payload if present, or pass in
    mailbox_id: mailboxId,
    direction,
    seq,
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext)
  };
}

export function decryptMessage(kSession, msgObj) {
  const nonce = hexToBytes(msgObj.nonce);
  const ciphertext = hexToBytes(msgObj.ciphertext);
  const mailboxIdBytes = hexToBytes(msgObj.mailbox_id);
  const dirBytes = new TextEncoder().encode(msgObj.direction);
  const seqBytes = new Uint8Array(8);
  new DataView(seqBytes.buffer).setBigUint64(0, BigInt(msgObj.seq), false);
  
  const aad = new Uint8Array([...mailboxIdBytes, ...dirBytes, ...seqBytes]);
  
  try {
    const plaintextBytes = xchacha20poly1305(kSession, nonce, aad).decrypt(ciphertext);
    const json = new TextDecoder().decode(plaintextBytes);
    return JSON.parse(json);
  } catch (e) {
    // Decryption failed (wrong key, wrong mailbox, or corrupted). Caller handles this.
    throw e;
  }
}

// --- Verification ---
export async function verifyAnchorSignature(anchor) {
  let pubKey, sig;
  const copy = { ...anchor };
  
  if (anchor.type === 'discovery') {
    pubKey = anchor.pub_sig;
    sig = anchor.sig;
    delete copy.sig;
  } else if (anchor.type === 'response') {
    pubKey = anchor.pub_sig_resp;
    sig = anchor.sig_resp;
    delete copy.sig_resp;
  } else if (anchor.type === 'session_end') {
    pubKey = anchor.pub_sig;
    sig = anchor.sig;
    delete copy.sig;
  } else {
    return false;
  }

  const payload = new TextEncoder().encode(canonicalStringify(copy));
  return await ed.verify(sig, payload, pubKey);
}

export function buildKKTPPayload(prefix, obj) {
  // KKTP:ANCHOR:<json> or KKTP:<mailbox>:<json>
  let content = canonicalStringify(obj);
  if (obj.type === 'msg') {
    return `${prefix}${obj.mailbox_id}:${content}`;
  }
  return `${prefix}ANCHOR:${content}`;
}