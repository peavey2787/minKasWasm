// core/protocol/kktpProtocol.js
import {
  discoveryValidator,
  responseValidator,
  mailboxMessageValidator,
  sessionEndValidator,
} from "./integrity/validator.js";
import { canonicalize, prepareForSigning } from "./integrity/canonical.js";
import { pack } from "./messenger.js";
import { KKTP_STATES } from "./stateMachine.js";

export class KKTPProtocol {
  constructor(portal, stateMachine) {
    this.portal = portal;
    this.sm = stateMachine;
  }

  /**
   * PHASE 1: Create a Discovery Anchor (Initiator)
   * Creates the initial "handshake intent" JSON.
   */
  async createDiscoveryAnchor(sid, pubSig, pubDh, metadata = {}) {
    const anchor = {
      type: "discovery",
      version: 1,
      sid,
      pub_sig: pubSig,
      pub_dh: pubDh,
      meta: metadata,
    };
    discoveryValidator.validate(anchor);
    // Save this anchor! The Initiator needs it to verify the future Response.
    this.sm.kktp.discoveryAnchor = anchor;
    return anchor;
  }

  /**
   * PHASE 2: Create a Response Anchor (Responder)
   * Creates the response to a discovery anchor.
   */
  async createResponseAnchor(discovery, pubSigResp, pubDhResp, metadata = {}) {
    const anchor = {
      type: "response",
      version: 1,
      sid: discovery.sid,
      pub_sig_resp: pubSigResp,
      pub_dh_resp: pubDhResp,
      meta: metadata,
    };
    responseValidator.validate(anchor);
    // The responder can connect IMMEDIATELY because they
    // already have both the discovery (passed in) and the response (just created).
    await this.sm.connect(discovery, anchor);
    return anchor;
  }

  /**
   * PHASE 3: Communicate
   * Wraps application data into a KKTP 'msg' anchor.
   */
  async createMessageAnchor(plaintext) {
    if (this.sm.state !== KKTP_STATES.ACTIVE) {
      throw new Error("Cannot send message: Session not established.");
    }
    const direction = this.sm.isInitiator ? "AtoB" : "BtoA";
    return pack(this.sm.kktp, plaintext, direction);
  }

  /**
   * PHASE 4: Terminate (Spec-Compliant Version)
   * Follows Section 5.5 and 7.4 of the KKTP Specification.
   */
  async createEndAnchor(reason = "finished", keyIndex = 0) {
    // 1. Construct the base object according to Section 5.5
    const anchor = {
      type: "session_end",
      version: 1,
      sid: this.sm.kktp.sid,
      pub_sig: this.sm.kktp.myPubSig, // We need to store our identity pubkey in the SM
      reason: reason,
    };

    // 2. Canonicalize and Sign (Section 5.1 & 7.9)
    // We omit 'sig' from the signing input as per Section 5.1
    const body = canonicalize(prepareForSigning(anchor, { omitKeys: ["sig"] }));

    // Use the portal to sign with the user's private key
    anchor.sig = await this.portal.crypto.signMessage(body, keyIndex);

    // 3. Final Validation against your Schema
    sessionEndValidator.validate(anchor);

    // 4. State Transition (Section 6.8)
    this.sm.state = KKTP_STATES.CLOSED;

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

      // Inside processIncoming(anchor)
      case "session_end":
        sessionEndValidator.validate(anchor);

        // Verify the signature against the identity key established in the handshake
        const isA = anchor.pub_sig === this.sm.kktp.pub_sig;
        const isB = anchor.pub_sig === this.sm.kktp.pub_sig_resp;

        if (!isA && !isB)
          throw new Error("Unauthorized SessionEnd: Signature key mismatch.");

        const body = canonicalize(
          prepareForSigning(anchor, { omitKeys: ["sig"] }),
        );
        const isValid = await this.portal.crypto.verifyMessage(
          anchor.pub_sig,
          body,
          anchor.sig,
        );

        if (!isValid) throw new Error("Invalid SessionEnd signature.");

        this.sm.state = KKTP_STATES.CLOSED;
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
    return await this.portal.crypto.signMessage(privateKeyHex, body);
  }
}
