import { bytesToHex } from "../utils/conversions.js";
import { constructAAD } from "./aad.js";
import { xchacha20poly1305 } from "https://esm.sh/@noble/ciphers/chacha";
import { kaspaPortal } from "../../../wrapper/kaspaPortal.js";

export class AnchorFactory {
  /**
   * Section 6.1: Discovery Anchor
   */
  async createDiscovery(gameName, version = "1.0.0") {
    const sid = bytesToHex(window.crypto.getRandomValues(new Uint8Array(16)));

    // Direct singleton use
    const keys = await kaspaPortal.generateIdentityKeys(0);
    const dhSession = await kaspaPortal.crypto.createDHSession();

    const vrfInput = keys.sig.publicKey + dhSession.publicKey + sid;
    const vrfData = await kaspaPortal.vrf.prove(vrfInput);

    const discovery = {
      type: "discovery",
      version: 1,
      sid: sid,
      pub_sig: keys.sig.publicKey,
      pub_dh: dhSession.publicKey,
      vrf_value: vrfData.value,
      vrf_proof: vrfData.proof,
      meta: {
        game: gameName,
        version: version, // Nested inside meta for validator
        expected_uptime_seconds: 3600,
      },
    };

    discovery.sig = await kaspaPortal.signAnchor(discovery);
    return { discovery, dhPrivateKey: dhSession.privateKey };
  }

  /**
   * Section 6.2: Response Anchor
   */
  async createResponse(discovery) {
    const keys = await kaspaPortal.generateIdentityKeys(1);
    const dhSession = await kaspaPortal.crypto.createDHSession();

    const response = {
      type: "response",
      version: 1,
      sid: discovery.sid,
      initiator_pub_sig: discovery.pub_sig,
      initiator_pub_dh: discovery.pub_dh,
      pub_sig_resp: keys.sig.publicKey,
      pub_dh_resp: dhSession.publicKey,
      vrf_value: null,
      vrf_proof: null,
      meta: {
        version: discovery.meta.version
      }
    };

    const vrfInput =
      discovery.pub_sig +
      discovery.pub_dh +
      response.pub_sig_resp +
      response.pub_dh_resp +
      discovery.sid;

    const vrfData = await kaspaPortal.vrf.prove(vrfInput);
    response.vrf_value = vrfData.value;
    response.vrf_proof = vrfData.proof;

    response.sig_resp = await kaspaPortal.signAnchor(response);
    return { response, dhPrivateKey: dhSession.privateKey };
  }

  /**
   * Section 6.5: Message Object
   */
  async createMessage(mailboxId, direction, seq, plaintext, sessionKey) {
    const nonce = crypto.getRandomValues(new Uint8Array(24));
    const aad = constructAAD(mailboxId, direction, seq);

    const chacha = new xchacha20poly1305(sessionKey, nonce);
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
