// kktp-core/stateMachine.js
import { establishSession } from "./integrity/handshake.js";
import { pack, unpack } from "./messenger.js";

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
      mailboxId: null, // Derived via Section 6.3
      sid: null,
      myPubSig: null, // Our identity for SessionEnd
      peerPubSig: null, // Peer identity for verification

      // Section 6.6: Independent counters
      outboundSeq: 0,
      inboundSeq: 1,

      // Section 7.2: Reassembly buffers
      buffer: [],
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

      const { session, mailboxId } = await establishSession(
        this.kaspaPortal,
        discovery,
        response,
        this.keyIndex,
        dhPriv,
        this.isInitiator
      );

      this.kktp.session = session;
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
   * Receives, reorders, and enforces strict contiguous delivery (Section 7.2)
   */
  receiveMessage(msg) {
    if (this.state !== KKTP_STATES.ACTIVE) return [];

    // 1. Replay Protection: Discard old or duplicate sequences
    if (msg.seq < this.kktp.inboundSeq) return [];

    // 2. Buffer Limit: Prevent memory DoS
    if (this.kktp.buffer.length >= this.kktp.maxBufferSize) {
      this.state = KKTP_STATES.FAULTED;
      throw new Error("Buffer overflow: Potential DoS or massive gap.");
    }

    // 3. Add to reassembly buffer and sort
    if (!this.kktp.buffer.find((m) => m.seq === msg.seq)) {
      this.kktp.buffer.push(msg);
      this.kktp.buffer.sort((a, b) => a.seq - b.seq);
    }

    const readyPlaintexts = [];

    // 4. Strict contiguous processing (The "While" loop from Section 6.7)
    while (
      this.kktp.buffer.length > 0 &&
      this.kktp.buffer[0].seq === this.kktp.inboundSeq
    ) {
      const next = this.kktp.buffer.shift();

      try {
        // Section 6.6: AAD must include direction and seq
        const plain = unpack(this.kktp, next);
        if (plain) readyPlaintexts.push(plain);
        this.kktp.inboundSeq++;
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
    // ZEROIZE: Securely erase keys from memory
    if (this.kktp.session) {
      this.kktp.session.zeroize(); // Assuming session object has a secure wipe
      this.kktp.session = null;
    }
    this.kktp.buffer = [];
  }
}
