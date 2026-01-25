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
    kaspaPortal.crypto.verifyMessage(discovery.pub_sig, discBody, discovery.sig),
    kaspaPortal.crypto.verifyMessage(
      response.pub_sig_resp,
      respBody,
      response.sig_resp,
    ),
  ]);

  if (!isDValid || !isRValid)
    throw new Error("Handshake Failed: Invalid Signatures");

  // 2. VRF Binding Verification
  // Initiator Binding: H(pub_sig || pub_dh || sid)
  const initiatorVrfInput =
    discovery.pub_sig + discovery.pub_dh + discovery.sid;
  const isInitiatorVrfValid = await kaspaPortal.vrf.verify(
    discovery.vrf_value,
    discovery.vrf_proof,
    initiatorVrfInput,
  );

  // Responder Binding: H(pub_sig_A || pub_dh_A || pub_sig_B || pub_dh_B || sid)
  const responderVrfInput =
    response.initiator_pub_sig +
    response.initiator_pub_dh +
    response.pub_sig_resp +
    response.pub_dh_resp +
    discovery.sid;

  const isResponderVrfValid = await kaspaPortal.vrf.verify(
    response.vrf_value,
    response.vrf_proof,
    responderVrfInput,
  );

  if (!isInitiatorVrfValid || !isResponderVrfValid) {
    throw new Error("Handshake Failed: VRF Binding Mismatch.");
  }

  // 3. DH Shared Secret Derivation
  const session = await kaspaPortal.startSession(keyIndex);

  // Check if we are the initiator (discovery) or responder (response)
  const peerDH =
    discovery.pub_dh === session.myPublicKeyHex
      ? response.pub_dh_resp
      : discovery.pub_dh;

  const rawSharedSecret = await session.deriveSharedSecret(peerDH);

  // 4. Session Key Derivation
  const pubSigA = hexToBytes(discovery.pub_sig);
  const pubSigB = hexToBytes(response.pub_sig_resp);
  const sidBytes = hexToBytes(discovery.sid);

  const info = new Uint8Array(pubSigA.length + pubSigB.length);
  info.set(pubSigA, 0);
  info.set(pubSigB, pubSigA.length);

  const kSession = hkdf(blake2b, sidBytes, rawSharedSecret, info, 32);
  session.setSessionKey(kSession);

  // 5. Mailbox ID Derivation
  const mailboxInput = new Uint8Array(
    pubSigA.length + pubSigB.length + sidBytes.length,
  );
  mailboxInput.set(pubSigA, 0);
  mailboxInput.set(pubSigB, pubSigA.length);
  mailboxInput.set(sidBytes, pubSigA.length + pubSigB.length);

  const mailboxId = bytesToHex(blake2b(mailboxInput, { dkLen: 32 }));

  return { session, mailboxId };
}
