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
    const vrfData = await kaspaPortal.vrf.prove({ seedInput: vrfInput });

    return {
      type: "discovery",
      version: 1,
      sid: sid,
      pub_sig: sig.publicKey,
      pub_dh: dh.publicKey,
      vrf_value: bytesToHex(vrfData.finalOutput),
      vrf_proof: bytesToHex(vrfData.proof),
      meta: {
        game: meta.game,
        version: meta.version || "1.0.0",
        expected_uptime_seconds: meta.upTime || 3600,
      },
    };
  }

  /**
   * Section 6.2: Response Anchor
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
      meta: {
        version: discovery.meta.version,
      },
    };

    const vrfInput =
      discovery.pub_sig +
      discovery.pub_dh +
      response.pub_sig_resp +
      response.pub_dh_resp +
      discovery.sid;

    const vrfData = await kaspaPortal.vrf.prove({ seedInput: vrfInput });

    // FIX APPLIED HERE:
    response.vrf_value = bytesToHex(vrfData.finalOutput);
    response.vrf_proof = bytesToHex(vrfData.proof);

    return response;
  }

  /**
   * Section 6.5: Message Object
   */
  async createMessage(mailboxId, direction, seq, plaintext, sessionKey) {
    const nonce = window.crypto.getRandomValues(new Uint8Array(24));
    const aad = constructAAD(mailboxId, direction, seq);

    // NO 'new' keyword here
    const chacha = xchacha20poly1305(sessionKey, nonce);
    const ciphertext = chacha.encrypt(new TextEncoder().encode(plaintext), aad);

    return {
      type: "msg",
      version: 1,
      mailbox_id: mailboxId,
      direction: direction,
      seq: Number(seq),
      nonce: bytesToHex(nonce),
      ciphertext: bytesToHex(ciphertext),
    };
  }

  /**
   * Section 8.1 / 5.5: Session End Anchor
   */
  async createSessionEndAnchor(sid, reason = "Session terminated by user") {
    const keys = await kaspaPortal.generateIdentityKeys(0);

    const sessionEnd = {
      type: "session_end",
      version: 1,
      sid: sid,
      pub_sig: keys.sig.publicKey,
      reason: reason,
    };

    sessionEnd.sig = await kaspaPortal.signAnchor(sessionEnd);
    return sessionEnd;
  }
}
