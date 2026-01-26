// kktp-core/network/kaspaAdapter.js

export class KaspaAdapter {
  constructor(stateMachine, kaspaPortal) {
    this.stateMachine = stateMachine;
    this.kaspaPortal = kaspaPortal; // Your scanner/broadcaster link
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
      throw new Error("Payload exceeds Kaspa limits. Application-layer chunking required.");
    }

    // 4. Broadcast to the DAG
    return await this.kaspaPortal.send(networkPayload);
  }

  /**
   * Section 6.5: Mailbox Detection and Scanning
   * Filters incoming transactions before handing them to the State Machine.
   */
  processIncoming(rawPayload) {
    // 1. Prefix Check
    if (!rawPayload.startsWith("KKTP:")) return;

    // 2. Split out the mailbox_id
    // Format: KKTP:[mailbox_id]:{json...}
    const parts = rawPayload.split(":");
    if (parts.length < 3) return;

    const incomingMailboxId = parts[1];
    const jsonStr = parts.slice(2).join(":"); // Rejoin in case JSON contains colons

    // 3. Mailbox Filtering (§6.5)
    if (incomingMailboxId !== this.stateMachine.kktp.mailboxId) {
      return; // Not for us
    }

    try {
      const msg = JSON.parse(jsonStr);
      // 4. Hand off to the Brain for Reordering/Decryption
      return this.stateMachine.receiveMessage(msg);
    } catch (e) {
      console.warn("Dropped malformed KKTP packet:", e.message);
    }
  }
}
