/**
 * LobbyManager - Group session management on top of KKTP
 *
 * Architecture:
 * - Host broadcasts a KKTP discovery anchor with lobby=true
 * - Peers join via private 1:1 KKTP DM with join request
 * - Host distributes GroupKey_vN via encrypted 1:1 DMs
 * - All group messages encrypted with XChaCha20-Poly1305 using groupKey
 * - Key rotation every 10 minutes with state root commitment
 *
 * @module kktp/lobby/lobbyManager
 */

import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
import { LobbyCodec } from "./lobbyCodec.js";
import { LobbyMessageHandler } from "./lobbyMessageHandler.js";
import {
  validateLobbyMeta,
  validateJoinRequest,
  validateJoinResponse,
  validateGroupMessage,
  validateKeyRotation,
  validateMemberEvent,
} from "./lobbySchemas.js";

// Constants
const KEY_ROTATION_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_MEMBERS_DEFAULT = 16;
const LOBBY_VERSION = 1;

/**
 * Lobby states
 */
export const LOBBY_STATES = {
  IDLE: "IDLE",
  HOSTING: "HOSTING",
  JOINING: "JOINING",
  MEMBER: "MEMBER",
  CLOSED: "CLOSED",
};

/**
 * Member roles
 */
export const MEMBER_ROLES = {
  HOST: "host",
  MEMBER: "member",
};

/**
 * @typedef {Object} LobbyMember
 * @property {string} pubSig - Member's public signing key
 * @property {string} displayName - Member's display name
 * @property {string} role - 'host' or 'member'
 * @property {number} joinedAt - Timestamp when member joined
 * @property {string} dmMailboxId - 1:1 DM mailbox for private communication
 */

/**
 * @typedef {Object} LobbyState
 * @property {string} lobbyId - Unique lobby identifier (sid of host's discovery)
 * @property {string} lobbyName - Human-readable lobby name
 * @property {string} hostPubSig - Host's public signing key
 * @property {Map<string, LobbyMember>} members - pubSig -> LobbyMember
 * @property {Uint8Array} groupKey - Current symmetric key for group messages
 * @property {number} keyVersion - Current key version (increments on rotation)
 * @property {string} groupMailboxId - Shared mailbox for group messages
 * @property {number} maxMembers - Maximum allowed members
 * @property {number} createdAt - Lobby creation timestamp
 * @property {string} state - Current lobby state
 */

export class LobbyManager {
  /**
   * @param {Object} sessionManager - KKTP SessionManager instance
   * @param {Object} options - Configuration options
   * @param {number} [options.maxMembers=16] - Default max members
   * @param {number} [options.keyRotationMs=600000] - Key rotation interval
   */
  constructor(sessionManager, options = {}) {
    this.sm = sessionManager;
    this.codec = new LobbyCodec();
    this.handler = new LobbyMessageHandler(this);

    // Configuration
    this.maxMembersDefault = options.maxMembers ?? MAX_MEMBERS_DEFAULT;
    this.keyRotationMs = options.keyRotationMs ?? KEY_ROTATION_INTERVAL_MS;

    // State
    this.state = LOBBY_STATES.IDLE;
    this.lobby = null;
    this.keyRotationTimer = null;

    // Event callbacks
    this._onMemberJoin = null;
    this._onMemberLeave = null;
    this._onGroupMessage = null;
    this._onKeyRotation = null;
    this._onLobbyClose = null;
    this._onStateChange = null;

    // Pending join requests (host only)
    this._pendingJoins = new Map(); // pubSig -> { request, dmMailboxId, receivedAt }

    // Message history
    this._messageHistory = [];
    this._maxHistorySize = 1000;
  }

  // ─────────────────────────────────────────────────────────────
  // Event Registration
  // ─────────────────────────────────────────────────────────────

  /**
   * Register callback for member join events
   * @param {function(LobbyMember): void} callback
   */
  onMemberJoin(callback) {
    this._onMemberJoin = callback;
  }

  /**
   * Register callback for member leave events
   * @param {function(string, string): void} callback - (pubSig, reason)
   */
  onMemberLeave(callback) {
    this._onMemberLeave = callback;
  }

  /**
   * Register callback for group messages
   * @param {function(Object): void} callback - (decryptedMessage)
   */
  onGroupMessage(callback) {
    this._onGroupMessage = callback;
  }

  /**
   * Register callback for key rotation events
   * @param {function(number): void} callback - (newKeyVersion)
   */
  onKeyRotation(callback) {
    this._onKeyRotation = callback;
  }

  /**
   * Register callback for lobby close events
   * @param {function(string): void} callback - (reason)
   */
  onLobbyClose(callback) {
    this._onLobbyClose = callback;
  }

  /**
   * Register callback for state changes
   * @param {function(string, string): void} callback - (newState, oldState)
   */
  onStateChange(callback) {
    this._onStateChange = callback;
  }

  // ─────────────────────────────────────────────────────────────
  // Host Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Create and host a new lobby
   * @param {Object} options - Lobby options
   * @param {string} options.lobbyName - Human-readable lobby name
   * @param {string} options.gameName - Game/app identifier
   * @param {number} [options.maxMembers] - Maximum members allowed
   * @param {number} [options.uptimeSeconds=3600] - Lobby duration
   * @returns {Promise<Object>} - { lobbyId, discovery }
   */
  async hostLobby({
    lobbyName,
    gameName,
    maxMembers = this.maxMembersDefault,
    uptimeSeconds = 3600,
  }) {
    if (this.state !== LOBBY_STATES.IDLE) {
      throw new Error(`Cannot host lobby in state: ${this.state}`);
    }

    this._setState(LOBBY_STATES.HOSTING);

    try {
      // Build lobby meta for discovery anchor
      const meta = {
        game: gameName,
        version: "1.0.0",
        expected_uptime_seconds: uptimeSeconds,
        lobby: true,
        lobby_name: lobbyName,
        max_members: maxMembers,
      };

      validateLobbyMeta(meta);

      // Broadcast discovery with lobby flag
      const discovery = await this.sm.broadcastDiscovery(meta);

      // Generate initial group key
      const groupKey = await this._generateGroupKey();
      const groupMailboxId = await this._deriveGroupMailboxId(discovery.sid);

      // Initialize lobby state
      this.lobby = {
        lobbyId: discovery.sid,
        lobbyName,
        hostPubSig: discovery.pub_sig,
        members: new Map(),
        groupKey,
        keyVersion: 1,
        groupMailboxId,
        maxMembers,
        createdAt: Date.now(),
        state: LOBBY_STATES.HOSTING,
        discovery,
      };

      // Add self as host member
      this.lobby.members.set(discovery.pub_sig, {
        pubSig: discovery.pub_sig,
        displayName: lobbyName + " (Host)",
        role: MEMBER_ROLES.HOST,
        joinedAt: Date.now(),
        dmMailboxId: null, // Host doesn't DM self
      });

      // Start key rotation timer
      this._startKeyRotation();

      console.info("KKTP Lobby: Hosted lobby", {
        lobbyId: discovery.sid,
        lobbyName,
        groupMailboxId,
      });

      return { lobbyId: discovery.sid, discovery };
    } catch (err) {
      this._setState(LOBBY_STATES.IDLE);
      throw err;
    }
  }

  /**
   * Process a join request from a peer (host only)
   * @param {string} dmMailboxId - The 1:1 DM mailbox with the requesting peer
   * @param {Object} request - The join request message
   * @returns {Promise<boolean>} - Whether the join was accepted
   */
  async handleJoinRequest(dmMailboxId, request) {
    if (this.state !== LOBBY_STATES.HOSTING) {
      console.warn("KKTP Lobby: Received join request but not hosting");
      return false;
    }

    try {
      validateJoinRequest(request);
    } catch (err) {
      console.warn("KKTP Lobby: Invalid join request", err.message);
      return false;
    }

    const { pubSig, displayName, lobbyId } = request;

    // Verify lobby ID matches
    if (lobbyId !== this.lobby.lobbyId) {
      console.warn("KKTP Lobby: Join request for wrong lobby", {
        expected: this.lobby.lobbyId,
        received: lobbyId,
      });
      await this._sendJoinResponse(dmMailboxId, false, "Lobby not found");
      return false;
    }

    // Check capacity
    if (this.lobby.members.size >= this.lobby.maxMembers) {
      console.warn("KKTP Lobby: Lobby is full");
      await this._sendJoinResponse(dmMailboxId, false, "Lobby is full");
      return false;
    }

    // Check if already a member
    if (this.lobby.members.has(pubSig)) {
      console.warn("KKTP Lobby: Peer is already a member");
      await this._sendJoinResponse(dmMailboxId, true, "Already a member");
      return true;
    }

    // Accept the join request
    const member = {
      pubSig,
      displayName: displayName || `Peer ${pubSig.slice(0, 8)}`,
      role: MEMBER_ROLES.MEMBER,
      joinedAt: Date.now(),
      dmMailboxId,
    };

    this.lobby.members.set(pubSig, member);

    // Send acceptance with current group key
    await this._sendJoinResponse(dmMailboxId, true, "Welcome", {
      groupKey: this._exportGroupKey(),
      keyVersion: this.lobby.keyVersion,
      groupMailboxId: this.lobby.groupMailboxId,
      members: this._exportMemberList(),
    });

    // Broadcast member join to all existing members
    await this._broadcastMemberEvent("join", member);

    // Emit event
    this._onMemberJoin?.(member);

    console.info("KKTP Lobby: Member joined", {
      pubSig: pubSig.slice(0, 16),
      displayName: member.displayName,
      memberCount: this.lobby.members.size,
    });

    return true;
  }

  /**
   * Kick a member from the lobby (host only)
   * @param {string} pubSig - Member's public signing key
   * @param {string} [reason="Kicked by host"]
   */
  async kickMember(pubSig, reason = "Kicked by host") {
    if (this.state !== LOBBY_STATES.HOSTING) {
      throw new Error("Only host can kick members");
    }

    if (pubSig === this.lobby.hostPubSig) {
      throw new Error("Host cannot kick themselves");
    }

    const member = this.lobby.members.get(pubSig);
    if (!member) {
      throw new Error("Member not found");
    }

    // Remove from roster
    this.lobby.members.delete(pubSig);

    // Notify the kicked member via DM
    if (member.dmMailboxId) {
      try {
        await this.sm.sendMessage(
          member.dmMailboxId,
          JSON.stringify({
            type: "lobby_kicked",
            version: LOBBY_VERSION,
            lobbyId: this.lobby.lobbyId,
            reason,
          }),
        );
      } catch (err) {
        console.warn("KKTP Lobby: Failed to notify kicked member", err);
      }
    }

    // Broadcast member leave to remaining members
    await this._broadcastMemberEvent("leave", { pubSig, reason });

    // Rotate key to exclude kicked member
    await this.rotateKey("Member kicked");

    // Emit event
    this._onMemberLeave?.(pubSig, reason);

    console.info("KKTP Lobby: Member kicked", {
      pubSig: pubSig.slice(0, 16),
      reason,
    });
  }

  /**
   * Rotate the group key (host only)
   * @param {string} [reason="Scheduled rotation"]
   */
  async rotateKey(reason = "Scheduled rotation") {
    if (this.state !== LOBBY_STATES.HOSTING) {
      throw new Error("Only host can rotate keys");
    }

    // Generate new key
    const newKey = await this._generateGroupKey();
    const newVersion = this.lobby.keyVersion + 1;

    // Compute state root for integrity
    const stateRoot = await this._computeStateRoot();

    // Distribute new key to all members via their DM channels
    const distribution = {
      type: "key_rotation",
      version: LOBBY_VERSION,
      lobbyId: this.lobby.lobbyId,
      keyVersion: newVersion,
      groupKey: this._uint8ToHex(newKey),
      stateRoot,
      reason,
      timestamp: Date.now(),
    };

    // Send to each member
    for (const [pubSig, member] of this.lobby.members) {
      if (member.role === MEMBER_ROLES.HOST) continue;
      if (!member.dmMailboxId) continue;

      try {
        await this.sm.sendMessage(
          member.dmMailboxId,
          JSON.stringify(distribution),
        );
      } catch (err) {
        console.warn("KKTP Lobby: Failed to send key rotation to member", {
          pubSig: pubSig.slice(0, 16),
          error: err.message,
        });
      }
    }

    // Update local state
    this.lobby.groupKey = newKey;
    this.lobby.keyVersion = newVersion;

    // Emit event
    this._onKeyRotation?.(newVersion);

    console.info("KKTP Lobby: Key rotated", {
      version: newVersion,
      reason,
      memberCount: this.lobby.members.size,
    });
  }

  /**
   * Close the lobby (host only)
   * @param {string} [reason="Lobby closed by host"]
   */
  async closeLobby(reason = "Lobby closed by host") {
    if (this.state !== LOBBY_STATES.HOSTING) {
      throw new Error("Only host can close lobby");
    }

    // Stop key rotation
    this._stopKeyRotation();

    // Notify all members
    const closeMsg = {
      type: "lobby_close",
      version: LOBBY_VERSION,
      lobbyId: this.lobby.lobbyId,
      reason,
      timestamp: Date.now(),
    };

    for (const [pubSig, member] of this.lobby.members) {
      if (member.role === MEMBER_ROLES.HOST) continue;
      if (!member.dmMailboxId) continue;

      try {
        await this.sm.sendMessage(member.dmMailboxId, JSON.stringify(closeMsg));
      } catch (err) {
        console.warn("KKTP Lobby: Failed to notify member of close", err);
      }
    }

    // Broadcast session end for the discovery anchor
    if (this.lobby.discovery) {
      try {
        await this.sm.closeSession(this.lobby.lobbyId, reason);
      } catch (err) {
        console.warn("KKTP Lobby: Failed to broadcast session end", err);
      }
    }

    // Clean up
    this._cleanup();

    // Emit event
    this._onLobbyClose?.(reason);

    console.info("KKTP Lobby: Closed", { reason });
  }

  // ─────────────────────────────────────────────────────────────
  // Peer Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Request to join a lobby
   * @param {Object} lobbyDiscovery - The host's discovery anchor
   * @param {string} displayName - Your display name
   * @returns {Promise<Object>} - { success, lobbyId, groupMailboxId }
   */
  async joinLobby(lobbyDiscovery, displayName) {
    if (this.state !== LOBBY_STATES.IDLE) {
      throw new Error(`Cannot join lobby in state: ${this.state}`);
    }

    if (!lobbyDiscovery?.meta?.lobby) {
      throw new Error("Discovery is not a lobby anchor");
    }

    this._setState(LOBBY_STATES.JOINING);

    try {
      // Establish 1:1 DM with host
      const session = await this.sm.connectToPeer(lobbyDiscovery);
      const dmMailboxId = session.mailboxId;

      // Get our identity
      const myKeys = await kaspaPortal.getMyIdentity();
      const myPubSig = myKeys.sig.publicKey;

      // Send join request via DM
      const joinRequest = {
        type: "lobby_join_request",
        version: LOBBY_VERSION,
        lobbyId: lobbyDiscovery.sid,
        pubSig: myPubSig,
        displayName,
        timestamp: Date.now(),
      };

      await this.sm.sendMessage(dmMailboxId, JSON.stringify(joinRequest));

      // Store pending state
      this._pendingJoin = {
        lobbyDiscovery,
        dmMailboxId,
        displayName,
        sentAt: Date.now(),
      };

      console.info("KKTP Lobby: Join request sent", {
        lobbyId: lobbyDiscovery.sid,
        lobbyName: lobbyDiscovery.meta.lobby_name,
      });

      // Response will come async via handleJoinResponse
      return { pending: true, lobbyId: lobbyDiscovery.sid, dmMailboxId };
    } catch (err) {
      this._setState(LOBBY_STATES.IDLE);
      throw err;
    }
  }

  /**
   * Handle join response from host
   * @param {string} dmMailboxId - The DM mailbox ID
   * @param {Object} response - The join response
   */
  async handleJoinResponse(dmMailboxId, response) {
    if (this.state !== LOBBY_STATES.JOINING) {
      console.warn("KKTP Lobby: Received join response but not joining");
      return;
    }

    try {
      validateJoinResponse(response);
    } catch (err) {
      console.warn("KKTP Lobby: Invalid join response", err.message);
      return;
    }

    if (!response.accepted) {
      console.warn("KKTP Lobby: Join request rejected", response.reason);
      this._setState(LOBBY_STATES.IDLE);
      this._pendingJoin = null;
      return;
    }

    // Initialize lobby state as member
    const { groupKey, keyVersion, groupMailboxId, members } = response;

    this.lobby = {
      lobbyId: this._pendingJoin.lobbyDiscovery.sid,
      lobbyName: this._pendingJoin.lobbyDiscovery.meta.lobby_name,
      hostPubSig: this._pendingJoin.lobbyDiscovery.pub_sig,
      members: new Map(),
      groupKey: this._hexToUint8(groupKey),
      keyVersion,
      groupMailboxId,
      maxMembers: this._pendingJoin.lobbyDiscovery.meta.max_members,
      createdAt: Date.now(),
      state: LOBBY_STATES.MEMBER,
      dmMailboxId, // Our DM with host
    };

    // Import member list
    if (Array.isArray(members)) {
      for (const m of members) {
        this.lobby.members.set(m.pubSig, m);
      }
    }

    this._setState(LOBBY_STATES.MEMBER);
    this._pendingJoin = null;

    console.info("KKTP Lobby: Joined successfully", {
      lobbyId: this.lobby.lobbyId,
      lobbyName: this.lobby.lobbyName,
      memberCount: this.lobby.members.size,
    });
  }

  /**
   * Handle key rotation from host (member only)
   * @param {Object} rotation - Key rotation message
   */
  handleKeyRotation(rotation) {
    if (this.state !== LOBBY_STATES.MEMBER) {
      console.warn("KKTP Lobby: Received key rotation but not a member");
      return;
    }

    try {
      validateKeyRotation(rotation);
    } catch (err) {
      console.warn("KKTP Lobby: Invalid key rotation", err.message);
      return;
    }

    if (rotation.lobbyId !== this.lobby.lobbyId) {
      console.warn("KKTP Lobby: Key rotation for wrong lobby");
      return;
    }

    // Verify version progression
    if (rotation.keyVersion <= this.lobby.keyVersion) {
      console.warn("KKTP Lobby: Stale key rotation ignored", {
        current: this.lobby.keyVersion,
        received: rotation.keyVersion,
      });
      return;
    }

    // Update key
    this.lobby.groupKey = this._hexToUint8(rotation.groupKey);
    this.lobby.keyVersion = rotation.keyVersion;

    // Emit event
    this._onKeyRotation?.(rotation.keyVersion);

    console.info("KKTP Lobby: Key updated", {
      version: rotation.keyVersion,
      reason: rotation.reason,
    });
  }

  /**
   * Handle member event (join/leave)
   * @param {Object} event - Member event
   */
  handleMemberEvent(event) {
    if (this.state !== LOBBY_STATES.MEMBER) return;

    try {
      validateMemberEvent(event);
    } catch (err) {
      console.warn("KKTP Lobby: Invalid member event", err.message);
      return;
    }

    if (event.lobbyId !== this.lobby.lobbyId) return;

    if (event.eventType === "join") {
      const member = {
        pubSig: event.pubSig,
        displayName: event.displayName,
        role: MEMBER_ROLES.MEMBER,
        joinedAt: event.timestamp,
      };
      this.lobby.members.set(member.pubSig, member);
      this._onMemberJoin?.(member);
      console.info("KKTP Lobby: Member joined", { displayName: member.displayName });
    } else if (event.eventType === "leave") {
      this.lobby.members.delete(event.pubSig);
      this._onMemberLeave?.(event.pubSig, event.reason);
      console.info("KKTP Lobby: Member left", { pubSig: event.pubSig.slice(0, 16) });
    }
  }

  /**
   * Handle being kicked from lobby
   * @param {Object} kickMsg - Kick message
   */
  handleKicked(kickMsg) {
    if (this.state !== LOBBY_STATES.MEMBER) return;

    if (kickMsg.lobbyId !== this.lobby.lobbyId) return;

    console.warn("KKTP Lobby: Kicked from lobby", kickMsg.reason);

    this._cleanup();
    this._onLobbyClose?.(kickMsg.reason);
  }

  /**
   * Handle lobby close notification
   * @param {Object} closeMsg - Close message
   */
  handleLobbyClose(closeMsg) {
    if (this.state !== LOBBY_STATES.MEMBER) return;

    if (closeMsg.lobbyId !== this.lobby.lobbyId) return;

    console.info("KKTP Lobby: Lobby closed by host", closeMsg.reason);

    this._cleanup();
    this._onLobbyClose?.(closeMsg.reason);
  }

  /**
   * Leave the lobby voluntarily (member only)
   * @param {string} [reason="Left voluntarily"]
   */
  async leaveLobby(reason = "Left voluntarily") {
    if (this.state !== LOBBY_STATES.MEMBER) {
      throw new Error("Not a lobby member");
    }

    // Notify host via DM
    if (this.lobby.dmMailboxId) {
      try {
        const myKeys = await kaspaPortal.getMyIdentity();
        await this.sm.sendMessage(
          this.lobby.dmMailboxId,
          JSON.stringify({
            type: "lobby_leave",
            version: LOBBY_VERSION,
            lobbyId: this.lobby.lobbyId,
            pubSig: myKeys.sig.publicKey,
            reason,
            timestamp: Date.now(),
          }),
        );
      } catch (err) {
        console.warn("KKTP Lobby: Failed to notify host of leave", err);
      }
    }

    this._cleanup();

    console.info("KKTP Lobby: Left lobby", { reason });
  }

  // ─────────────────────────────────────────────────────────────
  // Messaging
  // ─────────────────────────────────────────────────────────────

  /**
   * Send a message to the lobby group
   * @param {string} plaintext - Message content
   * @returns {Promise<Object>} - { txid, seq }
   */
  async sendGroupMessage(plaintext) {
    if (this.state !== LOBBY_STATES.HOSTING && this.state !== LOBBY_STATES.MEMBER) {
      throw new Error("Not in an active lobby");
    }

    const myKeys = await kaspaPortal.getMyIdentity();

    // Encrypt with group key
    const encrypted = await this.codec.encryptGroupMessage(
      plaintext,
      this.lobby.groupKey,
      this.lobby.groupMailboxId,
      this.lobby.keyVersion,
      myKeys.sig.publicKey,
    );

    // Broadcast to group mailbox
    const payload = `KKTP:GROUP:${this.lobby.groupMailboxId}:${JSON.stringify(encrypted)}`;

    const result = await kaspaPortal.send(payload);

    // Add to local history
    this._addToHistory({
      type: "outbound",
      senderPubSig: myKeys.sig.publicKey,
      plaintext,
      timestamp: Date.now(),
      txid: result?.txid,
    });

    return result;
  }

  /**
   * Process an incoming group message
   * @param {Object} encrypted - Encrypted group message
   */
  async processGroupMessage(encrypted) {
    if (this.state !== LOBBY_STATES.HOSTING && this.state !== LOBBY_STATES.MEMBER) {
      return;
    }

    try {
      validateGroupMessage(encrypted);
    } catch (err) {
      console.warn("KKTP Lobby: Invalid group message format", err.message);
      return;
    }

    // Verify key version matches
    if (encrypted.keyVersion !== this.lobby.keyVersion) {
      console.warn("KKTP Lobby: Group message with wrong key version", {
        expected: this.lobby.keyVersion,
        received: encrypted.keyVersion,
      });
      return;
    }

    try {
      // Decrypt
      const decrypted = await this.codec.decryptGroupMessage(
        encrypted,
        this.lobby.groupKey,
        this.lobby.groupMailboxId,
      );

      // Add to history
      this._addToHistory({
        type: "inbound",
        senderPubSig: encrypted.senderPubSig,
        plaintext: decrypted,
        timestamp: encrypted.timestamp || Date.now(),
      });

      // Emit event
      this._onGroupMessage?.({
        senderPubSig: encrypted.senderPubSig,
        plaintext: decrypted,
        timestamp: encrypted.timestamp,
        senderName: this.lobby.members.get(encrypted.senderPubSig)?.displayName,
      });
    } catch (err) {
      console.warn("KKTP Lobby: Failed to decrypt group message", err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────

  /**
   * Get current lobby state
   */
  get currentState() {
    return this.state;
  }

  /**
   * Get current lobby info (if any)
   */
  get lobbyInfo() {
    if (!this.lobby) return null;
    return {
      lobbyId: this.lobby.lobbyId,
      lobbyName: this.lobby.lobbyName,
      hostPubSig: this.lobby.hostPubSig,
      memberCount: this.lobby.members.size,
      maxMembers: this.lobby.maxMembers,
      keyVersion: this.lobby.keyVersion,
      isHost: this.state === LOBBY_STATES.HOSTING,
    };
  }

  /**
   * Get member list
   */
  get members() {
    if (!this.lobby) return [];
    return Array.from(this.lobby.members.values());
  }

  /**
   * Get message history
   */
  get messageHistory() {
    return [...this._messageHistory];
  }

  /**
   * Check if we are the host
   */
  get isHost() {
    return this.state === LOBBY_STATES.HOSTING;
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────

  _setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this._onStateChange?.(newState, oldState);
  }

  async _generateGroupKey() {
    // Generate 32 bytes of secure random
    const key = crypto.getRandomValues(new Uint8Array(32));
    return key;
  }

  async _deriveGroupMailboxId(lobbyId) {
    // Derive a deterministic group mailbox from lobby ID
    // Using BLAKE2b for domain separation
    const encoder = new TextEncoder();
    const data = encoder.encode(`KKTP:GROUP:MAILBOX:${lobbyId}`);

    // Use kaspaPortal's crypto if available, otherwise fallback
    try {
      const hash = await kaspaPortal.crypto.blake2b(data, 32);
      return this._uint8ToHex(hash);
    } catch {
      // Fallback: use the lobbyId directly (first 32 bytes hex)
      return lobbyId.slice(0, 64);
    }
  }

  async _computeStateRoot() {
    // Merkle-ish commitment to roster + key version
    const members = Array.from(this.lobby.members.keys()).sort();
    const data = JSON.stringify({
      lobbyId: this.lobby.lobbyId,
      keyVersion: this.lobby.keyVersion,
      members,
    });

    try {
      const encoder = new TextEncoder();
      const hash = await kaspaPortal.crypto.blake2b(encoder.encode(data), 32);
      return this._uint8ToHex(hash);
    } catch {
      // Fallback
      return null;
    }
  }

  _exportGroupKey() {
    return this._uint8ToHex(this.lobby.groupKey);
  }

  _exportMemberList() {
    return Array.from(this.lobby.members.values()).map((m) => ({
      pubSig: m.pubSig,
      displayName: m.displayName,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  async _sendJoinResponse(dmMailboxId, accepted, reason, extras = {}) {
    const response = {
      type: "lobby_join_response",
      version: LOBBY_VERSION,
      lobbyId: this.lobby.lobbyId,
      accepted,
      reason,
      timestamp: Date.now(),
      ...extras,
    };

    await this.sm.sendMessage(dmMailboxId, JSON.stringify(response));
  }

  async _broadcastMemberEvent(eventType, member) {
    const event = {
      type: "lobby_member_event",
      version: LOBBY_VERSION,
      lobbyId: this.lobby.lobbyId,
      eventType,
      pubSig: member.pubSig,
      displayName: member.displayName,
      reason: member.reason,
      timestamp: Date.now(),
    };

    // Send to all members via DM
    for (const [pubSig, m] of this.lobby.members) {
      if (m.role === MEMBER_ROLES.HOST) continue;
      if (pubSig === member.pubSig) continue; // Don't send to the subject
      if (!m.dmMailboxId) continue;

      try {
        await this.sm.sendMessage(m.dmMailboxId, JSON.stringify(event));
      } catch (err) {
        console.warn("KKTP Lobby: Failed to broadcast member event", err);
      }
    }
  }

  _startKeyRotation() {
    if (this.keyRotationTimer) return;

    this.keyRotationTimer = setInterval(async () => {
      try {
        await this.rotateKey("Scheduled rotation");
      } catch (err) {
        console.error("KKTP Lobby: Key rotation failed", err);
      }
    }, this.keyRotationMs);
  }

  _stopKeyRotation() {
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
      this.keyRotationTimer = null;
    }
  }

  _addToHistory(msg) {
    this._messageHistory.push(msg);
    if (this._messageHistory.length > this._maxHistorySize) {
      this._messageHistory.shift();
    }
  }

  _cleanup() {
    this._stopKeyRotation();
    this.lobby = null;
    this._pendingJoin = null;
    this._pendingJoins.clear();
    this._messageHistory = [];
    this._setState(LOBBY_STATES.IDLE);
  }

  _uint8ToHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  _hexToUint8(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }
}
