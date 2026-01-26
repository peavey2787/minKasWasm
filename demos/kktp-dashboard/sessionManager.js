// sessionManager.js - Single source of truth for KKTP sessions
import { KKTPStateMachine, KKTP_STATES } from "../../kktp/protocol/stateMachine.js";
import { KKTPProtocol } from "../../kktp/protocol/kktpProtocol.js";
import { canonicalize, prepareForSigning } from "../../kktp/protocol/integrity/canonical.js";

/**
 * SessionManager: Manages multiple KKTP sessions.
 * Storage: Map of mailboxId -> { stateMachine, protocol, messages, discovery, response, peerPubSig }
 */
export class SessionManager {
  constructor(kaspaPortal) {
    this.kaspaPortal = kaspaPortal;
    this.sessions = new Map();
    this.pendingDiscoveries = new Map(); // sid -> discovery (our broadcasts awaiting response)
    this.myPubSig = null; // Our current identity public key
    this.onSessionUpdate = null; // Callback for UI updates
    this.onMessageReceived = null; // Callback for new messages
    this.onPeerDiscovered = null; // Callback for peer discovery anchors
  }

  /**
   * Set our current identity public key
   */
  setMyIdentity(pubSig) {
    this.myPubSig = pubSig;
  }

  /**
   * Get session by mailboxId
   */
  getSession(mailboxId) {
    return this.sessions.get(mailboxId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions() {
    return Array.from(this.sessions.entries()).map(([mailboxId, session]) => ({
      mailboxId,
      ...session,
    }));
  }

  /**
   * Create a new session as initiator
   */
  async createSessionAsInitiator(discovery, response, dhPrivateKey) {
    const sm = new KKTPStateMachine(this.kaspaPortal, true, 0);
    sm.kktp.myDhPriv = dhPrivateKey;

    const protocol = new KKTPProtocol(sm);

    await sm.connect(discovery, response);

    const mailboxId = sm.kktp.mailboxId;
    const session = {
      stateMachine: sm,
      protocol,
      messages: [],
      discovery,
      response,
      peerPubSig: response.pub_sig_resp,
      isInitiator: true,
      createdAt: Date.now(),
    };

    this.sessions.set(mailboxId, session);
    this._notifySessionUpdate(mailboxId, "created");

    return { mailboxId, session };
  }

  /**
   * Create a new session as responder
   */
  async createSessionAsResponder(discovery, response, dhPrivateKey) {
    const sm = new KKTPStateMachine(this.kaspaPortal, false, 1);
    sm.kktp.myDhPriv = dhPrivateKey;

    const protocol = new KKTPProtocol(sm);

    await sm.connect(discovery, response);

    const mailboxId = sm.kktp.mailboxId;
    const session = {
      stateMachine: sm,
      protocol,
      messages: [],
      discovery,
      response,
      peerPubSig: discovery.pub_sig,
      isInitiator: false,
      createdAt: Date.now(),
    };

    this.sessions.set(mailboxId, session);
    this._notifySessionUpdate(mailboxId, "created");

    return { mailboxId, session };
  }

  /**
   * Send a message in a session
   */
  sendMessage(mailboxId, plaintext) {
    const session = this.sessions.get(mailboxId);
    if (!session) throw new Error(`Session not found: ${mailboxId}`);

    const sm = session.stateMachine;
    if (sm.state !== KKTP_STATES.ACTIVE) {
      throw new Error(`Cannot send in state: ${sm.state}`);
    }

    // Get the canonical packet from state machine
    const canonicalPacket = sm.sendMessage(plaintext);

    // Store locally with pending status
    const message = {
      id: crypto.randomUUID(),
      direction: sm.isInitiator ? "AtoB" : "BtoA",
      plaintext,
      timestamp: Date.now(),
      status: "pending",
      isOutbound: true,
    };

    session.messages.push(message);
    this._notifyMessageReceived(mailboxId, message);

    // Return the prefixed payload for broadcasting
    return {
      payload: `KKTP:${mailboxId}:${canonicalPacket}`,
      messageId: message.id,
    };
  }

  /**
   * Mark a pending message as confirmed
   */
  confirmMessage(mailboxId, messageId) {
    const session = this.sessions.get(mailboxId);
    if (!session) return;

    const message = session.messages.find((m) => m.id === messageId);
    if (message) {
      message.status = "confirmed";
      this._notifySessionUpdate(mailboxId, "message_confirmed");
    }
  }

  /**
   * Route an incoming message to the correct session
   */
  routeIncomingMessage(mailboxId, msgObject) {
    const session = this.sessions.get(mailboxId);
    if (!session) {
      console.warn(`No session found for mailbox: ${mailboxId}`);
      return null;
    }

    const sm = session.stateMachine;
    const plaintexts = sm.receiveMessage(msgObject);

    for (const plaintext of plaintexts) {
      const message = {
        id: crypto.randomUUID(),
        direction: msgObject.direction,
        plaintext,
        timestamp: Date.now(),
        status: "confirmed",
        isOutbound: false,
      };

      session.messages.push(message);
      this._notifyMessageReceived(mailboxId, message);
    }

    return plaintexts;
  }

  /**
   * Register a pending discovery (our broadcast)
   */
  registerPendingDiscovery(discovery, dhPrivateKey) {
    this.pendingDiscoveries.set(discovery.sid, {
      discovery,
      dhPrivateKey,
      createdAt: Date.now(),
    });
  }

  /**
   * Handle an incoming response to our discovery
   */
  async handleIncomingResponse(response) {
    const pending = this.pendingDiscoveries.get(response.sid);
    if (!pending) return null;

    // Verify this response is for us
    if (response.initiator_pub_sig !== pending.discovery.pub_sig) {
      console.warn("Response initiator_pub_sig mismatch");
      return null;
    }

    // Create session as initiator
    const { mailboxId, session } = await this.createSessionAsInitiator(
      pending.discovery,
      response,
      pending.dhPrivateKey,
    );

    // Remove from pending
    this.pendingDiscoveries.delete(response.sid);

    return { mailboxId, session };
  }

  /**
   * Close a session
   */
  closeSession(mailboxId) {
    const session = this.sessions.get(mailboxId);
    if (!session) return;

    // Zeroize keys per §7.7
    session.stateMachine.terminate();

    this.sessions.delete(mailboxId);
    this._notifySessionUpdate(mailboxId, "closed");
  }

  /**
   * Get session state
   */
  getSessionState(mailboxId) {
    const session = this.sessions.get(mailboxId);
    if (!session) return null;
    return session.stateMachine.state;
  }

  _notifySessionUpdate(mailboxId, event) {
    if (this.onSessionUpdate) {
      this.onSessionUpdate(mailboxId, event);
    }
  }

  _notifyMessageReceived(mailboxId, message) {
    if (this.onMessageReceived) {
      this.onMessageReceived(mailboxId, message);
    }
  }
}
