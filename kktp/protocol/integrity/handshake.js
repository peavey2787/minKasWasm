// kktp-core/handshake.js
import {
  discoveryValidator,
  responseValidator,
} from "../integrity/validator.js";
import { canonicalize, prepareForSigning } from "../integrity/canonical.js";
import { bytesToHex, hexToBytes } from "../utils/conversions.js";
import { blake2b } from "https://esm.sh/@noble/hashes@1.3.0/blake2b";
import { hkdf } from "https://esm.sh/@noble/hashes@1.3.0/hkdf";

/**
 * Establishes a session with mandatory VRF binding verification.
 * Follows KKTP Spec Sections 6.1, 6.2, 6.3, and 7.3.
 */
export async function establishSession(
  kaspaPortal,
  discovery,
  response,
  keyIndex = 0,
  dhPrivateKey = null,
  isInitiator = true,
) {
  // 1. Schema & Signature Validation
  discoveryValidator.validate(discovery);
  responseValidator.validate(response);

  const discBody = canonicalize(
    prepareForSigning(discovery, { omitKeys: ["sig"], excludeMeta: true }),
  );
  const respBody = canonicalize(
    prepareForSigning(response, { omitKeys: ["sig_resp"] }),
  );

  const [isDValid, isRValid] = await Promise.all([
    kaspaPortal.crypto.verifyMessage(
      discovery.pub_sig,
      discBody,
      discovery.sig,
    ),
    kaspaPortal.crypto.verifyMessage(
      response.pub_sig_resp,
      respBody,
      response.sig_resp,
    ),
  ]);

  if (!isDValid || !isRValid)
    throw new Error("Handshake Failed: Invalid Signatures");

  // 2. VRF Binding Verification
  const isInitiatorVrfValid = await kaspaPortal.verify(
    discovery.vrf_value,
    discovery.vrf_proof,
  );

  const isResponderVrfValid = await kaspaPortal.verify(
    response.vrf_value,
    response.vrf_proof,
  );

  if (!isInitiatorVrfValid || !isResponderVrfValid) {
    throw new Error("Handshake Failed: VRF Binding Mismatch.");
  }

  // 3. DH Shared Secret Derivation
  const session = await kaspaPortal.startSession(keyIndex, dhPrivateKey);

  // Per KKTP §6.2: Initiator uses responder DH; responder uses initiator DH
  const peerDH = isInitiator ? response.pub_dh_resp : discovery.pub_dh;
  if (!peerDH) {
    throw new Error("Handshake Failed: Missing peer DH public key.");
  }
  console.log("Peer DH Key:", peerDH);
  const rawSharedSecret = session.deriveSharedSecret(peerDH);

  // 4. Session Key Derivation
  const pubSigA = hexToBytes(discovery.pub_sig);
  const pubSigB = hexToBytes(response.pub_sig_resp);
  const sidBytes = hexToBytes(discovery.sid);

  const info = new Uint8Array(pubSigA.length + pubSigB.length);
  info.set(pubSigA, 0);
  info.set(pubSigB, pubSigA.length);

  let kSession = hkdf(blake2b, sidBytes, rawSharedSecret, info, 32);

  // Normalize to 32-byte Uint8Array (KKTP §6.2)
  const kSessionBytes =
    typeof kSession === "string"
      ? /^[0-9a-f]+$/i.test(kSession)
        ? hexToBytes(kSession)
        : base64ToBytes(kSession)
      : kSession;

  if (!(kSessionBytes instanceof Uint8Array) || kSessionBytes.length !== 32) {
    throw new Error(
      `Invalid K_session length: expected 32, got ${kSessionBytes?.length}`,
    );
  }

  session.setSessionKey(kSessionBytes);

  // 5. Mailbox ID Derivation
  const mailboxInput = new Uint8Array(
    pubSigA.length + pubSigB.length + sidBytes.length,
  );
  mailboxInput.set(pubSigA, 0);
  mailboxInput.set(pubSigB, pubSigA.length);
  mailboxInput.set(sidBytes, pubSigA.length + pubSigB.length);

  const mailboxId = bytesToHex(blake2b(mailboxInput, { dkLen: 32 }));

  return { session, mailboxId, sessionKey: kSessionBytes };
}
