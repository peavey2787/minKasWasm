// core/protocol/kktpProtocol.js
import {
  discoveryValidator,
  responseValidator,
  mailboxMessageValidator,
  sessionEndValidator,
} from "./integrity/validator.js";
import { canonicalize, prepareForSigning } from "./integrity/canonical.js";
import { KKTP_STATES } from "./stateMachine.js";
import { AnchorFactory } from "./integrity/anchorFactory.js";
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";

export class KKTPProtocol {
  constructor(stateMachine) {
    this.sm = stateMachine;
    this.anchorFactory = new AnchorFactory();
  }

  /**
   * PHASE 1: Create a Discovery Anchor
   * Delegates to factory for complex construction/VRF/Versioning.
   */
  async createDiscoveryAnchor(meta) {
    const keys = await kaspaPortal.generateIdentityKeys(0);
    this.sm.kktp.myDhPriv = keys.dh.privateKey;
    this.sm.kktp.myPrivSig = keys.sig.privateKey; // Store for SessionEnd signing (§5.5)

    const discovery = await this.anchorFactory.createDiscovery({
      meta,
      sig: keys.sig,
      dh: keys.dh,
    });
    discovery.sig = await this.signAnchor(discovery, keys.sig.privateKey);
    discoveryValidator.validate(discovery);

    // Store for the Initiator's state
    this.sm.kktp.discoveryAnchor = discovery;

    return { discovery, dhPrivateKey: keys.dh.privateKey };
  }

  /**
   * PHASE 2: Create a Response Anchor
   */
  async createResponseAnchor(discovery) {
    const keys = await kaspaPortal.generateIdentityKeys(1);
    this.sm.kktp.myDhPriv = keys.dh.privateKey;
    this.sm.kktp.myPrivSig = keys.sig.privateKey; // Store for SessionEnd signing (§5.5)

    const response = await this.anchorFactory.createResponse(discovery, {
      sig: keys.sig,
      dh: keys.dh,
    });
    response.sig_resp = await this.signAnchor(response, keys.sig.privateKey);
    responseValidator.validate(response);

    // Trigger State Machine connection immediately for Responder
    await this.sm.connect(discovery, response);

    return { response, dhPrivateKey: keys.dh.privateKey };
  }

  /**
   * PHASE 3: Communicate
   * Delegates to state machine for proper seq tracking (§6.6)
   */
  createMessageAnchor(plaintext) {
    if (this.sm.state !== KKTP_STATES.ACTIVE) {
      throw new Error("Cannot send message: Session not established.");
    }

    // Use state machine to ensure seq tracking + canonicalization (§5.4, §6.6)
    return this.sm.sendMessage(plaintext);
  }

  /**
   * PHASE 4: Terminate (§5.5, §7.7)
   */
  async createEndAnchor(reason = "finished") {
    const anchor = this.anchorFactory.createSessionEndAnchor(
      this.sm.kktp.sid,
      this.sm.kktp.myPubSig,
      reason
    );

    // Sign with the session's signing key
    anchor.sig = await this.signAnchor(anchor, this.sm.kktp.myPrivSig);

    sessionEndValidator.validate(anchor);
    this.sm.terminate();

    return anchor;
  }

  /**
   * THE INTAKE: Process any incoming KKTP object
   */
  async processIncoming(anchor) {
    switch (anchor.type) {
      case "discovery":
        discoveryValidator.validate(anchor);
        // Trigger UI/Game logic to ask user if they want to respond
        return { type: "DISCOVERY_RECEIVED", data: anchor };

      case "response":
        responseValidator.validate(anchor);
        const discoveryRef = this.sm.kktp.discoveryAnchor;
        if (!discoveryRef)
          throw new Error(
            "Need original discovery anchor to process response.",
          );
        await this.sm.connect(discoveryRef, anchor);
        return {
          type: "HANDSHAKE_COMPLETE",
          mailboxId: this.sm.kktp.mailboxId,
        };

      case "msg":
        mailboxMessageValidator.validate(anchor);
        // Decrypt and reorder via State Machine
        const messages = this.sm.receiveMessage(anchor);
        return { type: "MESSAGES_READY", data: messages };

      // Inside processIncoming(anchor) - §7.4 Signature Verification
      case "session_end":
        sessionEndValidator.validate(anchor);

        // Verify the signature against the identity key established in the handshake
        const isFromMe = anchor.pub_sig === this.sm.kktp.myPubSig;
        const isFromPeer = anchor.pub_sig === this.sm.kktp.peerPubSig;

        if (!isFromMe && !isFromPeer)
          throw new Error("Unauthorized SessionEnd: Signature key mismatch.");

        const body = canonicalize(
          prepareForSigning(anchor, { omitKeys: ["sig"] }),
        );
        const isValid = await kaspaPortal.crypto.verifyMessage(
          anchor.pub_sig,
          body,
          anchor.sig,
        );

        if (!isValid) throw new Error("Invalid SessionEnd signature.");

        this.sm.terminate();
        return { type: "SESSION_CLOSED", data: anchor.reason };

      default:
        throw new Error(`Unknown KKTP Anchor type: ${anchor.type}`);
    }
  }

  /**
   * Utility: Sign a KKTP Anchor
   */
  async signAnchor(anchor, privateKeyHex) {
    const isResponse = anchor.type === "response";
    const omitKeys = isResponse ? ["sig_resp"] : ["sig"];

    const body = canonicalize(
      prepareForSigning(anchor, { omitKeys, excludeMeta: true }),
    );

    // The protocol calls the crypto layer for the raw signature
    return await kaspaPortal.crypto.signMessage(privateKeyHex, body);
  }
}
