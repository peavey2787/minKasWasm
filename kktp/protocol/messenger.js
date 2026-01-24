// kktp-core/messenger.js
import { constructAAD } from "./canonical/aad.js";
import { mailboxMessageValidator } from "./canonical/validator.js";
import { bytesToHex, hexToBytes } from "./utils/conversion.js";

/**
 * Packs a plaintext message into a protocol-compliant Mailbox Message (Section 5.4)
 */
export function pack(kktpState, plaintext, direction, seq) {
  const { session, mailboxId, sid } = kktpState;

  // 1. Section 4 & 6.6: Generate a 192-bit (24-byte) CSPRNG Nonce
  const nonceBytes = crypto.getRandomValues(new Uint8Array(24));
  const nonceHex = bytesToHex(nonceBytes);

  // 2. Section 6.6: Construct AAD
  // AAD = mailbox_id (raw) || direction (UTF-8) || seq (u64BE)
  const aad = constructAAD(mailboxId, direction, seq);

  // 3. Encrypt using XChaCha20-Poly1305 (Section 4)
  // The session wrapper must handle the actual AEAD primitive
  const ciphertext = session.encrypt(plaintext, nonceBytes, aad);

  // 4. Return the standard JSON structure (Section 5.4)
  return {
    type: "msg",
    version: 1,
    sid: sid,
    mailbox_id: mailboxId,
    direction: direction,
    seq: seq,
    nonce: nonceHex,
    ciphertext: bytesToHex(ciphertext),
  };
}

/**
 * Unpacks and verifies an incoming message (Section 6.6 & 7.5)
 */
export function unpack(kktpState, msg) {
  // 1. Validation: Ensure the object matches the schema before processing
  mailboxMessageValidator.validate(msg);

  const { session, mailboxId } = kktpState;

  // 2. Filter: Ignore if it doesn't belong to this mailbox
  if (msg.mailbox_id !== mailboxId) return null;

  // 3. Reconstruction: Build AAD for decryption/integrity check
  const aad = constructAAD(mailboxId, msg.direction, msg.seq);
  const nonceBytes = hexToBytes(msg.nonce);
  const ciphertextBytes = hexToBytes(msg.ciphertext);

  // 4. Section 6.6: Decryption Hardening
  // Verify authentication tag + decrypt in one step (AEAD)
  try {
    const plaintext = session.decrypt(ciphertextBytes, nonceBytes, aad);
    if (!plaintext) throw new Error("Authentication failed");
    return plaintext;
  } catch (e) {
    // Section 7.5: Decryption failures are protocol violations
    throw new Error(`KKTP Integrity Violation: ${e.message}`);
  }
}
