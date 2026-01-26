import { bytesToHex, hexToBytes } from "../utils/conversions.js";
import { constructAAD } from "./aad.js";
import { xchacha20poly1305 } from "https://esm.sh/@noble/ciphers/chacha";
import { blake2b } from "https://esm.sh/@noble/hashes@1.3.0/blake2b";
import { kaspaPortal } from "../../../wrapper/kaspaPortal.js";
import { canonicalize } from "./canonical.js";
/**
 * Computes VRF input hash per §6.1: H(pub_sig || pub_dh || sid)
 * Hashing prevents canonicalization attacks from string concatenation.
 * @param {...string} hexStrings - Hex-encoded key components
 * @returns {string} Hex-encoded 32-byte Blake2b hash
 */
function computeVrfInputHash(...hexStrings) {
  const totalLen = hexStrings.reduce((sum, h) => sum + h.length / 2, 0);
  const combined = new Uint8Array(totalLen);

  let offset = 0;
  for (const hex of hexStrings) {
    const bytes = hexToBytes(hex);
    combined.set(bytes, offset);
    offset += bytes.length;
  }

  return bytesToHex(blake2b(combined, { dkLen: 32 }));
}

export class AnchorFactory {
  /**
   * Section 6.1: Discovery Anchor
   */
  async createDiscovery({ meta, sig, dh }) {
    const sid = bytesToHex(window.crypto.getRandomValues(new Uint8Array(32)));
    const vrfInputHash = computeVrfInputHash(sig.publicKey, dh.publicKey, sid);
    const vrfData = await kaspaPortal.prove({ seedInput: vrfInputHash });

    // 1. Build the base object
    const anchor = {
      type: "discovery",
      version: 1,
      sid: sid,
      pub_sig: sig.publicKey,
      pub_dh: dh.publicKey,
      vrf_value: vrfData.finalOutput,
      vrf_proof: bytesToHex(
        new TextEncoder().encode(JSON.stringify(vrfData.proof)),
      ),
      meta: {
        game: meta.game,
        version: meta.version || "1.0.0",
        expected_uptime_seconds: meta.upTime || 3600,
      },
    };

    // 2. Prepare for signing per Section 5.1 & 6.1
    // "omitted AND with the meta object excluded"
    const { sig: _, meta: __, ...signablePart } = anchor;

    // 3. Canonicalize (RFC 8785 / JCS)
    const messageToSign = canonicalize(signablePart);

    // 4. Sign using the private key
    anchor.sig = await kaspaPortal.crypto.signMessage(
      sig.privateKey,
      messageToSign,
    );

    return anchor;
  }

  /**
   * Section 6.2: Response Anchor
   * Per §5.3: Response anchors do NOT include meta
   * Per §5.3: Response MUST echo initiator's keys for cryptographic binding
   */
  async createResponse(discovery, { sig, dh }) {
    const response = {
      type: "response",
      version: 1,
      sid: discovery.sid,
      initiator_pub_sig: discovery.pub_sig,
      initiator_pub_dh: discovery.pub_dh,
      pub_sig_resp: sig.publicKey,
      pub_dh_resp: dh.publicKey,
      vrf_value: null,
      vrf_proof: null,
    };

    const vrfInputHash = computeVrfInputHash(
      discovery.pub_sig,
      discovery.pub_dh,
      sig.publicKey,
      dh.publicKey,
      discovery.sid,
    );

    try {
      const vrfData = await kaspaPortal.prove({ seedInput: vrfInputHash });
      response.vrf_value = vrfData.finalOutput;
      response.vrf_proof = bytesToHex(
        new TextEncoder().encode(JSON.stringify(vrfData.proof)),
      );
    } catch {
      // VRF is optional per deployment; keep nulls if not supported
      response.vrf_value = null;
      response.vrf_proof = null;
    }

    // COMPLIANCE §5.3: Canonicalize everything EXCEPT sig_resp
    const messageToSign = canonicalize(response);
    response.sig_resp = await kaspaPortal.crypto.signMessage(
      sig.privateKey,
      messageToSign,
    );

    return response;
  }

  /**
   * Section 6.5: Message Object
   * Per §5.4: Message anchors MUST include sid
   */
  async createMessage(sid, mailboxId, direction, seq, plaintext, sessionKey) {
    const nonce = window.crypto.getRandomValues(new Uint8Array(24));
    const aad = constructAAD(mailboxId, direction, seq);

    // NO 'new' keyword here
    const chacha = xchacha20poly1305(sessionKey, nonce, aad);
    const ciphertext = chacha.encrypt(new TextEncoder().encode(plaintext));

    return {
      type: "msg",
      version: 1,
      sid: sid,
      mailbox_id: mailboxId,
      direction: direction,
      seq: Number(seq),
      nonce: bytesToHex(nonce),
      ciphertext: bytesToHex(ciphertext),
    };
  }

  /**
   * Section 5.5 / 7.7: Session End Anchor
   * Uses the session's existing pub_sig (not new keys)
   */
  async createSessionEndAnchor(
    sid,
    sig,
    reason = "Session terminated by user",
  ) {
    const anchor = {
      type: "session_end",
      version: 1,
      sid: sid,
      pub_sig: sig.publicKey,
      reason: reason,
    };

    // COMPLIANCE §5.5: Sign the end signal
    const messageToSign = canonicalize(anchor);
    anchor.sig = await kaspaPortal.crypto.signMessage(
      sig.privateKey,
      messageToSign,
    );

    return anchor;
  }
}
