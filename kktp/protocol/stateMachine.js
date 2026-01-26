// kktp-core/stateMachine.js
import { establishSession } from "./integrity/handshake.js";
import { pack, unpack } from "./kktpCodec.js";

export const KKTP_STATES = {
  INIT: "INIT",
  ACTIVE: "ACTIVE",
  FAULTED: "FAULTED", // Section 6.8
  CLOSED: "CLOSED", // Section 7.7
};

export class KKTPStateMachine {
  constructor(kaspaPortal, isInitiator = true, keyIndex = 0) {
    this.kaspaPortal = kaspaPortal;
    this.isInitiator = isInitiator;
    this.keyIndex = keyIndex;
    this.state = KKTP_STATES.INIT;

    this.kktp = {
      session: null, // K_session + metadata
      sessionKey: null, // 32-byte K_session for AEAD
      mailboxId: null, // Derived via Section 6.3
      sid: null,
      myPubSig: null, // Our identity for SessionEnd
      myPrivSig: null, // Our private signing key for SessionEnd (§5.5)
      peerPubSig: null, // Peer identity for verification

      // Section 6.6: Independent counters per direction
      outboundSeq: 0,
      inboundSeq: {
        AtoB: 1,
        BtoA: 1,
      },

      // Section 7.2: Reassembly buffers per direction
      buffer: {
        AtoB: [],
        BtoA: [],
      },
      maxBufferSize: 100, // Protection against DoS memory exhaustion
    };
  }

  /**
   * Transition: INIT -> ACTIVE (Section 6.1 & 6.2)
   */
  async connect(discovery, response) {
    try {

      const dhPriv = this.kktp?.myDhPriv;
      if (!dhPriv) {
        throw new Error("Missing DH private key for session establishment.");
      }

      const { session, mailboxId, sessionKey } = await establishSession(
        this.kaspaPortal,
        discovery,
        response,
        this.keyIndex,
        dhPriv,
        this.isInitiator
      );

      this.kktp.session = session;
      this.kktp.sessionKey = sessionKey;
      this.kktp.mailboxId = mailboxId;
      this.kktp.sid = discovery.sid;

      // Map identities for Section 7.4 Signature Verification
      this.kktp.myPubSig = this.isInitiator
        ? discovery.pub_sig
        : response.pub_sig_resp;
      this.kktp.peerPubSig = this.isInitiator
        ? response.pub_sig_resp
        : discovery.pub_sig;

      this.state = KKTP_STATES.ACTIVE;
      return true;
    } catch (err) {
      this.state = KKTP_STATES.FAULTED;
      throw err;
    }
  }

  /**
   * Sends a message (Section 6.6)
   */
  sendMessage(plaintext) {
    if (this.state !== KKTP_STATES.ACTIVE)
      throw new Error(`Cannot send in state: ${this.state}`);

    // Strictly increasing sequence
    this.kktp.outboundSeq++;
    const direction = this.isInitiator ? "AtoB" : "BtoA";

    return pack(this.kktp, plaintext, direction, this.kktp.outboundSeq);
  }

  /**
   * Receives, reorders, and enforces strict contiguous delivery (Section 7.1 & 7.2)
   * Per-direction replay protection and buffering
   */
  receiveMessage(msg) {
    if (this.state !== KKTP_STATES.ACTIVE) return [];

    const direction = msg.direction;
    if (direction !== "AtoB" && direction !== "BtoA") {
      throw new Error(`Invalid direction: ${direction}`);
    }

    const expectedSeq = this.kktp.inboundSeq[direction];
    const buffer = this.kktp.buffer[direction];

    // 1. Replay Protection: Discard old or duplicate sequences (§7.1)
    if (msg.seq < expectedSeq) return [];

    // 2. Buffer Limit: Prevent memory DoS (§7.2)
    if (buffer.length >= this.kktp.maxBufferSize) {
      this.state = KKTP_STATES.FAULTED;
      throw new Error("Buffer overflow: Potential DoS or massive gap.");
    }

    // 3. Add to reassembly buffer (dedupe) and sort
    if (!buffer.find((m) => m.seq === msg.seq)) {
      buffer.push(msg);
      buffer.sort((a, b) => a.seq - b.seq);
    }

    const readyPlaintexts = [];

    // 4. Strict contiguous processing (§7.2)
    while (
      buffer.length > 0 &&
      buffer[0].seq === this.kktp.inboundSeq[direction]
    ) {
      const next = buffer.shift();

      try {
        // Section 6.6: AAD must include direction and seq
        const plain = unpack(this.kktp, next);
        if (plain) readyPlaintexts.push(plain);
        this.kktp.inboundSeq[direction]++;
      } catch (e) {
        // Section 7.11: AEAD failure marks session as FAULTED
        this.state = KKTP_STATES.FAULTED;
        throw new Error("Integrity violation: AEAD decryption failed.");
      }
    }

    return readyPlaintexts;
  }

  /**
   * Section 7.7: Secure Termination
   */
  terminate() {
    this.state = KKTP_STATES.CLOSED;

    // ZEROIZE: Securely erase keys from memory (§7.7)
    if (this.kktp.session?.zeroize) {
      this.kktp.session.zeroize();
    }
    this.kktp.session = null;

    // Zeroize session key
    if (this.kktp.sessionKey instanceof Uint8Array) {
      this.kktp.sessionKey.fill(0);
    }
    this.kktp.sessionKey = null;

    // Clear DH private key
    this.kktp.myDhPriv = null;
    this.kktp.myPrivSig = null;

    // Clear buffers
    this.kktp.buffer = { AtoB: [], BtoA: [] };
  }
}
