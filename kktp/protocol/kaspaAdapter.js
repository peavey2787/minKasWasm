// kktp-core/network/kaspaAdapter.js
import { canonicalize, prepareForSigning } from "./integrity/canonical.js";
import { mailboxMessageValidator } from "./integrity/validator.js";
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";

export class KaspaAdapter {
  constructor(stateMachine) {
    this.stateMachine = stateMachine;
  }

  /**
   * Section 6.4: Embedding in Kaspa Transactions
   * Wraps the canonical KKTP packet with the required network prefix.
   */
  async send(plaintext) {
    // 1. Get the canonical JSON string from the codec (via stateMachine)
    const canonicalPacket = this.stateMachine.sendMessage(plaintext);
    const mailboxId = this.stateMachine.kktp.mailboxId;

    // 2. Apply Prefix: "KKTP:" || mailbox_id_hex || ":" || <canonical JSON>
    const networkPayload = `KKTP:${mailboxId}:${canonicalPacket}`;

    // 3. Check Payload Limits (Section 6.4: ~32 KB)
    if (new TextEncoder().encode(networkPayload).length > 32000) {
      throw new Error(
        "Payload exceeds Kaspa limits. Application-layer chunking required.",
      );
    }

    // 4. Broadcast to the DAG
    return await kaspaPortal.send(networkPayload);
  }

  /**
   * Section 6.5: Mailbox Detection and Scanning
   * Filters incoming transactions before handing them to the State Machine.
   */
  async processIncoming(rawPayload) {
    // 1. Strict Prefix Check (§6.5)
    if (!rawPayload.startsWith("KKTP:")) return;

    // 2. Route by Sub-Prefix (§6.4)
    if (rawPayload.startsWith("KKTP:ANCHOR:")) {
      const jsonStr = rawPayload.substring("KKTP:ANCHOR:".length);
      return await this._handleAnchorIntake(jsonStr);
    }

    return this._handleMessageIntake(rawPayload);
  }

  /**
   * Handles Discovery, Response, and SessionEnd Anchors (§6.1, §6.8)
   */
  async _handleAnchorIntake(jsonStr) {
    try {
      const anchor = JSON.parse(jsonStr);

      // 1. Verify it's a valid KKTP object generally
      this._validateSchema(anchor);

      // 2. CRYPTO CHECK: Does the signature match the public key provided?
      // We do this here so the Facade doesn't have to know how to verify signatures.
      const isValid = await this._verifyAnchorSignature(anchor);
      if (!isValid) throw new Error("Invalid cryptographic signature");

      // 3. Hand off the AUTHENTICATED anchor to the Facade
      return await kaspaPortal.kktpProtocol.processIncoming(anchor);
    } catch (e) {
      console.warn("KaspaAdapter rejected anchor:", e.message);
    }
  }

  /**
   * Handles Encrypted Packets (§6.6)
   */
  _handleMessageIntake(rawPayload) {
    // Format: KKTP:[mailbox_id]:{json...}
    const parts = rawPayload.split(":");
    if (parts.length < 3) return;

    const incomingMailboxId = parts[1];
    const jsonStr = parts.slice(2).join(":"); // Rejoin in case JSON contains colons

    // Mailbox Filtering (§6.5)
    if (incomingMailboxId !== this.stateMachine.kktp.mailboxId) return;

    try {
      const msg = JSON.parse(jsonStr);

      // §6.5: Verify type is "msg" before processing
      if (msg.type !== "msg") {
        console.warn("Protocol Violation: Non-msg type in mailbox path.");
        return;
      }

      mailboxMessageValidator.validate(msg);
      // Hand off to the state machine for reordering/decryption
      return this.stateMachine.receiveMessage(msg);
    } catch (e) {
      console.warn("Dropped malformed KKTP packet:", e.message);
    }
  }

  /**
   * Signature verification per §7.4
   */
  async _verifyAnchorSignature(anchor) {
    const isResponse = anchor.type === "response";
    const isSessionEnd = anchor.type === "session_end";

    const sigField = isResponse ? "sig_resp" : "sig";
    const pubKeyField = isResponse ? "pub_sig_resp" : "pub_sig";

    const signature = anchor[sigField];
    const pubKey = anchor[pubKeyField];

    if (!signature || !pubKey) return false;

    const body = canonicalize(
      prepareForSigning(anchor, {
        omitKeys: [sigField],
        excludeMeta: anchor.type === "discovery",
      }),
    );

    return await kaspaPortal.crypto.verifyMessage(pubKey, body, signature);
  }
}
