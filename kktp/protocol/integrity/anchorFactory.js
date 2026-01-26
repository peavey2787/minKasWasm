import { bytesToHex } from "../utils/conversions.js";
import { constructAAD } from "./aad.js";
import { xchacha20poly1305 } from "https://esm.sh/@noble/ciphers/chacha";
import { kaspaPortal } from "../../../wrapper/kaspaPortal.js";

export class AnchorFactory {
  /**
   * Section 6.1: Discovery Anchor
   */
  async createDiscovery({ meta, sig, dh }) {
    const sid = bytesToHex(window.crypto.getRandomValues(new Uint8Array(16)));

    const vrfInput = sig.publicKey + dh.publicKey + sid;
    const vrfData = await kaspaPortal.prove({ seedInput: vrfInput });

    const proofJson = JSON.stringify(vrfData.proof);
    const proofHex = bytesToHex(new TextEncoder().encode(proofJson));

    return {
      type: "discovery",
      version: 1,
      sid: sid,
      pub_sig: sig.publicKey,
      pub_dh: dh.publicKey,
      vrf_value: vrfData.finalOutput, // already hex
      vrf_proof: proofHex,
      meta: {
        game: meta.game,
        version: meta.version || "1.0.0",
        expected_uptime_seconds: meta.upTime || 3600,
      },
    };
  }

  /**
   * Section 6.2: Response Anchor
   * Per §5.3: Response anchors do NOT include meta
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

    const vrfInput =
      discovery.pub_sig +
      discovery.pub_dh +
      response.pub_sig_resp +
      response.pub_dh_resp +
      discovery.sid;

    const vrfData = await kaspaPortal.prove({ seedInput: vrfInput });

    const proofJson = JSON.stringify(vrfData.proof);
    const proofHex = bytesToHex(new TextEncoder().encode(proofJson));

    response.vrf_value = vrfData.finalOutput; // already hex
    response.vrf_proof = proofHex;

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
  createSessionEndAnchor(sid, pubSig, reason = "Session terminated by user") {
    return {
      type: "session_end",
      version: 1,
      sid: sid,
      pub_sig: pubSig,
      reason: reason,
    };
  }
}
