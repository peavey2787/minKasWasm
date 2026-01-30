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

import { blake2b } from "https://esm.sh/@noble/hashes@1.3.0/blake2b";
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
   * @param {boolean} [options.autoAcceptJoins=true] - Automatically accept join requests
   */
  constructor(sessionManager, options = {}) {
    this.sm = sessionManager;
    this.codec = new LobbyCodec();
    this.handler = new LobbyMessageHandler(this);

    // Configuration
    this.maxMembersDefault = options.maxMembers ?? MAX_MEMBERS_DEFAULT;
    this.keyRotationMs = options.keyRotationMs ?? KEY_ROTATION_INTERVAL_MS;
    this.autoAcceptJoins = options.autoAcceptJoins ?? true;

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
    this._onJoinRequest = null; // Callback for join requests (host approval)

    // Pending join requests (host only)
    this._pendingJoins = new Map(); // pubSig -> { request, dmMailboxId, receivedAt }

    // Message history
    this._messageHistory = [];
    this._maxHistorySize = 1000;

    // ─────────────────────────────────────────────────────────────
    // DM Buffer - Handles race condition where DM arrives before session
    // Moved from dashboard/events.js to keep lobby module self-contained
    // ─────────────────────────────────────────────────────────────
    this._dmBuffer = new Map(); // mailboxId -> [{ payload, timestamp, bufferedAt }]
    this._dmBufferTtlMs = 30_000; // 30 seconds TTL
    this._dmBufferMaxPerMailbox = 5;
    this._dmBufferCleanupTimer = null;
    this._dmBufferCleanupIntervalMs = 10_000;
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

  /**
   * Register callback for join request events (host only)
   * Called when a peer requests to join and autoAcceptJoins is false.
   * @param {function(Object, function, function): void} callback - (request, acceptFn, rejectFn)
   */
  onJoinRequest(callback) {
    this._onJoinRequest = callback;
  }

  // ─────────────────────────────────────────────────────────────
  // Pending Join Management (for manual approval)
  // ─────────────────────────────────────────────────────────────

  /**
   * Get pending join requests (host only)
   * @returns {Array<Object>} Array of { pubSig, displayName, receivedAt }
   */
  get pendingJoinRequests() {
    return Array.from(this._pendingJoins.entries()).map(([pubSig, data]) => ({
      pubSig,
      displayName: data.request.displayName,
      receivedAt: data.receivedAt,
    }));
  }

  /**
   * Accept a pending join request (host only)
   * @param {string} pubSig - The requester's public signing key
   * @returns {Promise<boolean>} Whether the join was accepted
   */
  async acceptPendingJoin(pubSig) {
    const pending = this._pendingJoins.get(pubSig);
    if (!pending) {
      console.warn("KKTP Lobby: No pending join for", pubSig?.slice(0, 16));
      return false;
    }

    this._pendingJoins.delete(pubSig);
    return await this._acceptJoinRequest(pending.dmMailboxId, pending.request);
  }

  /**
   * Reject a pending join request (host only)
   * @param {string} pubSig - The requester's public signing key
   * @param {string} [reason="Rejected by host"] - Rejection reason
   * @returns {Promise<boolean>} Whether the rejection was sent
   */
  async rejectPendingJoin(pubSig, reason = "Rejected by host") {
    const pending = this._pendingJoins.get(pubSig);
    if (!pending) {
      console.warn("KKTP Lobby: No pending join for", pubSig?.slice(0, 16));
      return false;
    }

    this._pendingJoins.delete(pubSig);
    await this._sendJoinResponse(pending.dmMailboxId, false, reason);

    console.info("KKTP Lobby: Rejected join request", {
      pubSig: pubSig?.slice(0, 16),
      reason,
    });

    return true;
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
   * @returns {Promise<Object>} - { lobbyId, discovery, groupMailboxId }
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

    // Validate inputs early
    if (!lobbyName || typeof lobbyName !== "string") {
      throw new Error("lobbyName is required and must be a string");
    }
    if (!gameName || typeof gameName !== "string") {
      throw new Error("gameName is required and must be a string");
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
      // broadcastDiscovery returns { discovery, payload }
      const result = await this.sm.broadcastDiscovery(meta);
      const discovery = result?.discovery;

      if (!discovery || !discovery.sid) {
        throw new Error("Failed to broadcast discovery: no discovery anchor returned");
      }
      if (!discovery.pub_sig) {
        throw new Error("Failed to broadcast discovery: missing pub_sig");
      }

      const lobbyId = discovery.sid;

      // Generate initial group key
      const groupKey = await this._generateGroupKey();
      const groupMailboxId = this._deriveGroupMailboxId(lobbyId);

      // Initialize lobby state
      this.lobby = {
        lobbyId,
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
        displayName: `${lobbyName} (Host)`,
        role: MEMBER_ROLES.HOST,
        joinedAt: Date.now(),
        dmMailboxId: null, // Host doesn't DM self
      });

      // CRITICAL: Subscribe to group mailbox for incoming group messages
      this._subscribeToGroupMailbox(groupMailboxId);

      // Start key rotation timer
      this._startKeyRotation();

      console.info("KKTP Lobby: Hosted lobby", {
        lobbyId: lobbyId.substring(0, 16),
        lobbyName,
        groupMailboxId: groupMailboxId.substring(0, 16),
        hostPubSig: discovery.pub_sig.substring(0, 16),
      });

      return { lobbyId, discovery, groupMailboxId };
    } catch (err) {
      this._setState(LOBBY_STATES.IDLE);
      throw err;
    }
  }

  /**
   * Process a join request from a peer (host only)
   * @param {string} dmMailboxId - The 1:1 DM mailbox with the requesting peer
   * @param {Object} request - The join request message
   * @returns {Promise<boolean>} - Whether the join was accepted/pending
   */
  async handleJoinRequest(dmMailboxId, request) {
    // Self-echo filter: If we're in JOINING state, we might receive our own
    // join request echoed back from the blockchain. Check and skip.
    if (this.state === LOBBY_STATES.JOINING && this._pendingJoin) {
      const myPubSig = this._pendingJoin.myPubSig;
      if (request.pubSig === myPubSig) {
        console.debug("KKTP Lobby: Ignoring own join request echo", {
          myPubSig: myPubSig?.slice(0, 16),
        });
        return false;
      }
    }

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

    console.info("KKTP Lobby: Received join request", {
      pubSig: pubSig?.slice(0, 16),
      displayName,
      lobbyId: lobbyId?.slice(0, 16),
    });

    // Verify lobby ID matches
    if (lobbyId !== this.lobby.lobbyId) {
      console.warn("KKTP Lobby: Join request for wrong lobby", {
        expected: this.lobby.lobbyId?.slice(0, 16),
        received: lobbyId?.slice(0, 16),
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

    // Check if already pending
    if (this._pendingJoins.has(pubSig)) {
      console.warn("KKTP Lobby: Join request already pending for", pubSig?.slice(0, 16));
      return true;
    }

    // If auto-accept is enabled, accept immediately
    if (this.autoAcceptJoins) {
      return await this._acceptJoinRequest(dmMailboxId, request);
    }

    // Otherwise, store pending and emit callback for host approval
    this._pendingJoins.set(pubSig, {
      request,
      dmMailboxId,
      receivedAt: Date.now(),
    });

    // Emit callback with accept/reject functions
    if (this._onJoinRequest) {
      const acceptFn = () => this.acceptPendingJoin(pubSig);
      const rejectFn = (reason) => this.rejectPendingJoin(pubSig, reason);
      this._onJoinRequest(request, acceptFn, rejectFn);
    }

    console.info("KKTP Lobby: Join request pending approval", {
      pubSig: pubSig?.slice(0, 16),
      displayName,
    });

    return true; // Pending
  }

  /**
   * Internal: Accept a join request and add member to lobby
   * @private
   */
  async _acceptJoinRequest(dmMailboxId, request) {
    const { pubSig, displayName } = request;

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

    // Wait for UTXO refresh before broadcasting to prevent race condition
    // The join response transaction needs time to be mined before we can spend again
    await this._waitForUtxoRefresh(1000, 4000);

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

    // Notify the kicked member via DM (best-effort with retry)
    if (member.dmMailboxId) {
      try {
        await this._sendWithRetry(
          member.dmMailboxId,
          JSON.stringify({
            type: "lobby_kicked",
            version: LOBBY_VERSION,
            lobbyId: this.lobby.lobbyId,
            reason,
          }),
          2, // Fewer retries for kicked notification (not critical)
        );
      } catch (err) {
        console.warn("KKTP Lobby: Failed to notify kicked member", {
          pubSig: pubSig.slice(0, 16),
          error: err.message,
        });
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
    const stateRoot = this._computeStateRoot();

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

    const distributionJson = JSON.stringify(distribution);

    // Send to each member with retry logic for UTXO resilience
    for (const [pubSig, member] of this.lobby.members) {
      if (member.role === MEMBER_ROLES.HOST) continue;
      if (!member.dmMailboxId) continue;

      try {
        await this._sendWithRetry(member.dmMailboxId, distributionJson, 3);
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

    const closeMsgJson = JSON.stringify(closeMsg);

    for (const [pubSig, member] of this.lobby.members) {
      if (member.role === MEMBER_ROLES.HOST) continue;
      if (!member.dmMailboxId) continue;

      try {
        await this._sendWithRetry(member.dmMailboxId, closeMsgJson, 2);
      } catch (err) {
        console.warn("KKTP Lobby: Failed to notify member of close", {
          pubSig: pubSig.slice(0, 16),
          error: err.message,
        });
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
   * @returns {Promise<Object>} - { pending, lobbyId, dmMailboxId }
   */
  async joinLobby(lobbyDiscovery, displayName) {
    console.info("KKTP Lobby: Initiating join request", {
      lobbyId: lobbyDiscovery?.sid?.slice(0, 16),
      lobbyName: lobbyDiscovery?.meta?.lobby_name,
      hostPubSig: lobbyDiscovery?.pub_sig?.slice(0, 16),
      displayName,
      currentState: this.state,
    });

    if (this.state !== LOBBY_STATES.IDLE) {
      throw new Error(`Cannot join lobby in state: ${this.state}`);
    }

    if (!lobbyDiscovery?.meta?.lobby) {
      throw new Error("Discovery is not a lobby anchor");
    }

    if (!lobbyDiscovery.sid || !lobbyDiscovery.pub_sig) {
      throw new Error("Invalid lobby discovery: missing sid or pub_sig");
    }

    if (!displayName || typeof displayName !== "string") {
      displayName = "Anonymous";
    }

    this._setState(LOBBY_STATES.JOINING);

    try {
      // Establish 1:1 DM with host (broadcasts response anchor transaction)
      // This generates our session-specific identity keys via prepareKeyBranch()
      console.info("KKTP Lobby: Connecting to host", {
        hostPubSig: lobbyDiscovery.pub_sig?.slice(0, 16),
      });
      const connectResult = await this.sm.connectToPeer(lobbyDiscovery);
      if (!connectResult?.mailboxId) {
        throw new Error("Failed to connect to lobby host: no mailboxId");
      }
      const dmMailboxId = connectResult.mailboxId;

      // CRITICAL: Use the pubSig from the response anchor we just broadcast
      // This ensures the join request identity matches the session identity
      const myPubSig = connectResult.response?.pub_sig_resp;
      if (!myPubSig) {
        throw new Error("Failed to get identity from response anchor");
      }

      console.info("KKTP Lobby: Connected to host", {
        dmMailboxId: dmMailboxId?.slice(0, 16),
        myPubSig: myPubSig?.slice(0, 16),
      });

      // Wait for wallet UTXOs to refresh after the connect transaction
      // This prevents "Insufficient funds" errors from UTXO race conditions
      await this._waitForUtxoRefresh();

      // Build join request
      const joinRequest = {
        type: "lobby_join_request",
        version: LOBBY_VERSION,
        lobbyId: lobbyDiscovery.sid,
        pubSig: myPubSig,
        displayName,
        timestamp: Date.now(),
      };

      console.info("KKTP Lobby: Sending join request message", {
        dmMailboxId: dmMailboxId?.slice(0, 16),
        lobbyId: lobbyDiscovery.sid?.slice(0, 16),
        myPubSig: myPubSig?.slice(0, 16),
        displayName,
      });

      // Send with retry logic to handle transient UTXO availability
      await this._sendWithRetry(dmMailboxId, JSON.stringify(joinRequest), 3);

      // Store pending state
      this._pendingJoin = {
        lobbyDiscovery,
        dmMailboxId,
        myPubSig,
        displayName,
        lobbyId: lobbyDiscovery.sid,
        hostPubSig: lobbyDiscovery.pub_sig,
        sentAt: Date.now(),
      };

      console.info("KKTP Lobby: Join request sent successfully", {
        lobbyId: lobbyDiscovery.sid?.slice(0, 16),
        lobbyName: lobbyDiscovery.meta.lobby_name,
        dmMailboxId: dmMailboxId?.slice(0, 16),
        state: this.state,
      });

      // Response will come async via handleJoinResponse
      return { pending: true, lobbyId: lobbyDiscovery.sid, dmMailboxId };
    } catch (err) {
      console.error("KKTP Lobby: Join request failed", {
        error: err.message,
        lobbyId: lobbyDiscovery?.sid?.slice(0, 16),
      });
      this._setState(LOBBY_STATES.IDLE);
      this._pendingJoin = null;
      throw err;
    }
  }

  /**
   * Handle join response from host
   * @param {string} dmMailboxId - The DM mailbox ID
   * @param {Object} response - The join response
   */
  async handleJoinResponse(dmMailboxId, response) {
    console.info("KKTP Lobby: Received join response", {
      dmMailboxId: dmMailboxId?.slice(0, 16),
      currentState: this.state,
      accepted: response?.accepted,
      reason: response?.reason,
      hasGroupKey: !!response?.groupKey,
      keyVersion: response?.keyVersion,
      memberCount: response?.members?.length,
    });

    if (this.state !== LOBBY_STATES.JOINING) {
      // This is expected - host receives echo of their own response on the DM channel
      // Just log at debug level and return silently
      console.debug("KKTP Lobby: Ignoring join response (not in JOINING state)", {
        currentState: this.state,
      });
      return;
    }

    try {
      validateJoinResponse(response);
    } catch (err) {
      console.warn("KKTP Lobby: Invalid join response", {
        error: err.message,
        response: JSON.stringify(response).slice(0, 200),
      });
      return;
    }

    if (!response.accepted) {
      console.warn("KKTP Lobby: Join request rejected", {
        reason: response.reason,
        lobbyId: this._pendingJoin?.lobbyDiscovery?.sid?.slice(0, 16),
      });
      this._setState(LOBBY_STATES.IDLE);
      this._pendingJoin = null;
      return;
    }

    // Initialize lobby state as member
    const { groupKey, keyVersion, groupMailboxId, members } = response;

    if (!this._pendingJoin) {
      console.error("KKTP Lobby: No pending join data when processing response");
      this._setState(LOBBY_STATES.IDLE);
      return;
    }

    console.info("KKTP Lobby: Initializing lobby state as member", {
      lobbyId: this._pendingJoin.lobbyDiscovery.sid?.slice(0, 16),
      lobbyName: this._pendingJoin.lobbyDiscovery.meta?.lobby_name,
      hostPubSig: this._pendingJoin.lobbyDiscovery.pub_sig?.slice(0, 16),
      keyVersion,
      groupMailboxId: groupMailboxId?.slice(0, 16),
      memberCount: members?.length,
    });

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
      console.info("KKTP Lobby: Imported member list", {
        memberCount: this.lobby.members.size,
        members: members.map(m => m.displayName || m.pubSig?.slice(0, 8)),
      });
    }

    // CRITICAL: Subscribe to group mailbox for incoming group messages
    this._subscribeToGroupMailbox(groupMailboxId);

    const oldState = this.state;
    this._setState(LOBBY_STATES.MEMBER);
    this._pendingJoin = null;

    console.info("KKTP Lobby: Joined successfully", {
      lobbyId: this.lobby.lobbyId?.slice(0, 16),
      lobbyName: this.lobby.lobbyName,
      memberCount: this.lobby.members.size,
      oldState,
      newState: this.state,
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

    // Notify host via DM (best-effort with retry)
    if (this.lobby?.dmMailboxId) {
      try {
        const myKeys = await this.sm.portal.generateIdentityKeys(0);
        if (!myKeys?.sig?.publicKey) {
          throw new Error("Failed to get identity keys");
        }
        await this._sendWithRetry(
          this.lobby.dmMailboxId,
          JSON.stringify({
            type: "lobby_leave",
            version: LOBBY_VERSION,
            lobbyId: this.lobby.lobbyId,
            pubSig: myKeys.sig.publicKey,
            reason,
            timestamp: Date.now(),
          }),
          2, // Fewer retries for leave notification
        );
      } catch (err) {
        console.warn("KKTP Lobby: Failed to notify host of leave", {
          error: err.message,
        });
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
   * @returns {Promise<Object>} - { txid }
   */
  async sendGroupMessage(plaintext) {
    if (this.state !== LOBBY_STATES.HOSTING && this.state !== LOBBY_STATES.MEMBER) {
      throw new Error("Not in an active lobby");
    }

    if (!this.lobby?.groupKey || !this.lobby?.groupMailboxId) {
      throw new Error("Lobby not initialized or missing group key");
    }

    if (!plaintext || typeof plaintext !== "string") {
      throw new Error("plaintext must be a non-empty string");
    }

    const myKeys = await this.sm.portal.generateIdentityKeys(0);
    if (!myKeys?.sig?.publicKey) {
      throw new Error("Failed to get identity keys");
    }

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

    // Get address for self-send
    const address = await this.sm.portal.identity.address;
    const result = await this.sm.portal.send({
      toAddress: address,
      amount: "1",
      payload,
    });

    // Add to local history with nonce for deduplication
    this._addToHistory({
      type: "outbound",
      senderPubSig: myKeys.sig.publicKey,
      plaintext,
      timestamp: Date.now(),
      txid: result?.txid,
      nonce: encrypted.nonce, // Store nonce for dedupe check
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

    // High-precision deduplication: Check BOTH senderPubSig AND nonce for ALL messages
    // This prevents: (1) self-echo (our own message reflected back)
    //                (2) nonce collision (two different users with same nonce)
    // Without checking both, Peer C's first message could be dropped if it has
    // the same nonce as Peer B's first message that we already processed.
    if (encrypted.senderPubSig && encrypted.nonce) {
      const isDuplicate = this._messageHistory.some(
        (m) =>
          m.senderPubSig === encrypted.senderPubSig &&
          m.nonce === encrypted.nonce
      );
      if (isDuplicate) {
        console.debug("KKTP Lobby: Skipping duplicate message (nonce+pubSig match)", {
          senderPubSig: encrypted.senderPubSig.slice(0, 16),
          nonce: encrypted.nonce.slice(0, 16),
        });
        return;
      }
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

      // Add to history with nonce for potential future deduplication
      this._addToHistory({
        type: "inbound",
        senderPubSig: encrypted.senderPubSig,
        plaintext: decrypted,
        timestamp: encrypted.timestamp || Date.now(),
        nonce: encrypted.nonce, // Store nonce for dedupe
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
    if (oldState === newState) return; // No change

    this.state = newState;

    console.info("KKTP Lobby: State transition", {
      oldState,
      newState,
      isHost: this.isHost,
      lobbyId: this.lobby?.lobbyId?.slice(0, 16),
      memberCount: this.lobby?.members?.size,
    });

    this._onStateChange?.(newState, oldState);
  }

  async _generateGroupKey() {
    // Generate 32 bytes of secure random
    const key = crypto.getRandomValues(new Uint8Array(32));
    return key;
  }

  _deriveGroupMailboxId(lobbyId) {
    // Derive a deterministic group mailbox from lobby ID
    // Using BLAKE2b for domain separation
    const encoder = new TextEncoder();
    const data = encoder.encode(`KKTP:GROUP:MAILBOX:${lobbyId}`);
    const hash = blake2b(data, { dkLen: 32 });
    return this._uint8ToHex(hash);
  }

  _computeStateRoot() {
    // Merkle-ish commitment to roster + key version
    const members = Array.from(this.lobby.members.keys()).sort();
    const data = JSON.stringify({
      lobbyId: this.lobby.lobbyId,
      keyVersion: this.lobby.keyVersion,
      members,
    });
    const encoder = new TextEncoder();
    const hash = blake2b(encoder.encode(data), { dkLen: 32 });
    return this._uint8ToHex(hash);
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

    console.info("KKTP Lobby: Sending join response", {
      dmMailboxId: dmMailboxId?.slice(0, 16),
      accepted,
      reason,
      hasGroupKey: !!extras.groupKey,
      keyVersion: extras.keyVersion,
      memberCount: extras.members?.length,
    });

    try {
      // Use retry logic to handle transient UTXO availability issues
      await this._sendWithRetry(dmMailboxId, JSON.stringify(response), 3);
      console.info("KKTP Lobby: Join response sent successfully", {
        dmMailboxId: dmMailboxId?.slice(0, 16),
        accepted,
      });
    } catch (err) {
      console.error("KKTP Lobby: Failed to send join response", {
        dmMailboxId: dmMailboxId?.slice(0, 16),
        accepted,
        error: err.message,
      });
      throw err;
    }
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

    const eventJson = JSON.stringify(event);

    // Send to all members via DM with retry logic for UTXO resilience
    for (const [pubSig, m] of this.lobby.members) {
      if (m.role === MEMBER_ROLES.HOST) continue;
      if (pubSig === member.pubSig) continue; // Don't send to the subject
      if (!m.dmMailboxId) continue;

      try {
        await this._sendWithRetry(m.dmMailboxId, eventJson, 3);
      } catch (err) {
        console.warn("KKTP Lobby: Failed to broadcast member event", {
          eventType,
          targetPubSig: pubSig.slice(0, 16),
          error: err.message,
        });
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

  /**
   * Get the current user's public signing key
   * @returns {Promise<string|null>}
   * @private
   */
  async _getMyPubSig() {
    try {
      const myKeys = await this.sm.portal.generateIdentityKeys(0);
      return myKeys?.sig?.publicKey || null;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Public Routing API - For external message processing
  // ─────────────────────────────────────────────────────────────

  /**
   * Route a decrypted DM plaintext to the lobby handler.
   * Called by the dashboard/events layer when a DM is received.
   * @param {string} mailboxId - The DM mailbox ID
   * @param {string} plaintext - The decrypted message content (JSON string or plain text)
   * @returns {boolean} True if message was handled as a lobby message
   */
  routeDMMessage(mailboxId, plaintext) {
    return this.handler.processDMMessage(mailboxId, plaintext);
  }

  /**
   * Parse a raw KKTP payload to check if it's a group message.
   * @param {string} rawPayload - Raw KKTP payload string
   * @returns {{ isGroup: boolean, groupMailboxId?: string, encrypted?: Object }}
   */
  parseGroupPayload(rawPayload) {
    return this.handler.parseGroupPayload(rawPayload);
  }

  /**
   * Process a group message for this lobby.
   * @param {string} groupMailboxId - The group mailbox ID
   * @param {Object} encrypted - The encrypted group message object
   * @returns {Promise<boolean>} True if handled successfully
   */
  async routeGroupMessage(groupMailboxId, encrypted) {
    return await this.handler.processGroupMessage(groupMailboxId, encrypted);
  }

  /**
   * Check if we are currently in a lobby (either hosting or as member).
   * @returns {boolean}
   */
  isInLobby() {
    return this.state === LOBBY_STATES.HOSTING || this.state === LOBBY_STATES.MEMBER;
  }

  /**
   * Get the current lobby's group mailbox ID (if in a lobby).
   * @returns {string|null}
   */
  getGroupMailboxId() {
    return this.lobby?.groupMailboxId ?? null;
  }

  /**
   * Check if a group payload belongs to this lobby.
   * @param {string} groupMailboxId - The group mailbox ID from the payload
   * @returns {boolean}
   */
  isGroupPayloadForThisLobby(groupMailboxId) {
    if (!this.isInLobby() || !this.lobby?.groupMailboxId) return false;
    return this.lobby.groupMailboxId === groupMailboxId;
  }

  // ─────────────────────────────────────────────────────────────
  // DM Buffer Management - Race condition handling
  // ─────────────────────────────────────────────────────────────

  /**
   * Buffer a DM message for later processing when session is established.
   * @param {string} mailboxId - The DM mailbox ID
   * @param {string} payload - Raw payload to buffer
   * @param {number} [timestamp] - Message timestamp
   */
  bufferDMMessage(mailboxId, payload, timestamp) {
    const now = Date.now();

    if (!this._dmBuffer.has(mailboxId)) {
      this._dmBuffer.set(mailboxId, []);
    }

    const buffer = this._dmBuffer.get(mailboxId);

    // Limit buffer size per mailbox
    if (buffer.length >= this._dmBufferMaxPerMailbox) {
      console.warn("KKTP Lobby: DM buffer full, dropping oldest", {
        mailboxId: mailboxId?.slice(0, 16),
      });
      buffer.shift();
    }

    buffer.push({ payload, timestamp, bufferedAt: now });

    console.info("KKTP Lobby: Buffered early DM message", {
      mailboxId: mailboxId?.slice(0, 16),
      bufferSize: buffer.length,
    });

    this._startDMBufferCleanup();
  }

  /**
   * Check if there are buffered messages for a mailbox.
   * @param {string} mailboxId
   * @returns {boolean}
   */
  hasBufferedMessages(mailboxId) {
    const buffer = this._dmBuffer.get(mailboxId);
    return buffer && buffer.length > 0;
  }

  /**
   * Get and clear buffered messages for a mailbox.
   * Called when session is established to process pending messages.
   * @param {string} mailboxId
   * @returns {Array<{ payload: string, timestamp: number }>}
   */
  popBufferedMessages(mailboxId) {
    const buffer = this._dmBuffer.get(mailboxId);
    if (!buffer || buffer.length === 0) return [];

    const now = Date.now();
    const validMessages = buffer.filter(
      (msg) => now - msg.bufferedAt < this._dmBufferTtlMs
    );

    this._dmBuffer.delete(mailboxId);
    return validMessages;
  }

  /**
   * Clear buffered messages for a mailbox (e.g., on session end).
   * @param {string} mailboxId
   */
  clearBufferedMessages(mailboxId) {
    this._dmBuffer.delete(mailboxId);
  }

  /**
   * @private
   */
  _startDMBufferCleanup() {
    if (this._dmBufferCleanupTimer) return;
    this._dmBufferCleanupTimer = setInterval(
      () => this._cleanupExpiredBuffers(),
      this._dmBufferCleanupIntervalMs
    );
  }

  /**
   * @private
   */
  _cleanupExpiredBuffers() {
    const now = Date.now();
    let totalCleaned = 0;

    for (const [mailboxId, buffer] of this._dmBuffer.entries()) {
      const validMessages = buffer.filter(
        (msg) => now - msg.bufferedAt < this._dmBufferTtlMs
      );

      if (validMessages.length === 0) {
        this._dmBuffer.delete(mailboxId);
        totalCleaned += buffer.length;
      } else if (validMessages.length < buffer.length) {
        totalCleaned += buffer.length - validMessages.length;
        this._dmBuffer.set(mailboxId, validMessages);
      }
    }

    // Stop cleanup timer if buffer is empty
    if (this._dmBuffer.size === 0 && this._dmBufferCleanupTimer) {
      clearInterval(this._dmBufferCleanupTimer);
      this._dmBufferCleanupTimer = null;
    }
  }

  _cleanup() {
    this._stopKeyRotation();

    // Unsubscribe from group mailbox when leaving/closing
    if (this.lobby?.groupMailboxId) {
      this._unsubscribeFromGroupMailbox(this.lobby.groupMailboxId);
    }

    // Clear DM buffer and stop cleanup timer
    this._dmBuffer.clear();
    if (this._dmBufferCleanupTimer) {
      clearInterval(this._dmBufferCleanupTimer);
      this._dmBufferCleanupTimer = null;
    }

    this.lobby = null;
    this._pendingJoin = null;
    this._pendingJoins.clear();
    this._messageHistory = [];
    this._setState(LOBBY_STATES.IDLE);
  }

  // ─────────────────────────────────────────────────────────────
  // Group Mailbox Subscription
  // ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to the group mailbox for incoming group messages.
   * This adds the KKTP:GROUP:{groupMailboxId}: prefix to the scanner's watch list
   * so the host/member can receive group messages from all lobby participants.
   * @private
   * @param {string} groupMailboxId - The group mailbox ID to watch
   */
  _subscribeToGroupMailbox(groupMailboxId) {
    if (!groupMailboxId) {
      console.warn("KKTP Lobby: Cannot subscribe - no groupMailboxId");
      return;
    }

    const prefix = `KKTP:GROUP:${groupMailboxId}:`;

    // Access portal via session manager
    const portal = this.sm?.portal;
    if (!portal?.addPrefix) {
      console.warn("KKTP Lobby: Cannot subscribe - portal.addPrefix not available");
      return;
    }

    try {
      portal.addPrefix(prefix);
      console.info("KKTP Lobby: Subscribed to group mailbox", {
        groupMailboxId: groupMailboxId.slice(0, 16),
        prefix: prefix.slice(0, 32),
      });
    } catch (err) {
      console.error("KKTP Lobby: Failed to subscribe to group mailbox", {
        groupMailboxId: groupMailboxId.slice(0, 16),
        error: err.message,
      });
    }
  }

  /**
   * Unsubscribe from the group mailbox.
   * Called during cleanup when leaving or closing the lobby.
   * @private
   * @param {string} groupMailboxId - The group mailbox ID to stop watching
   */
  _unsubscribeFromGroupMailbox(groupMailboxId) {
    if (!groupMailboxId) return;

    const prefix = `KKTP:GROUP:${groupMailboxId}:`;

    const portal = this.sm?.portal;
    if (!portal?.removePrefix) {
      console.debug("KKTP Lobby: Cannot unsubscribe - portal.removePrefix not available");
      return;
    }

    try {
      portal.removePrefix(prefix);
      console.info("KKTP Lobby: Unsubscribed from group mailbox", {
        groupMailboxId: groupMailboxId.slice(0, 16),
      });
    } catch (err) {
      console.warn("KKTP Lobby: Failed to unsubscribe from group mailbox", {
        error: err.message,
      });
    }
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

  // ─────────────────────────────────────────────────────────────
  // UTXO Management Helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Wait for wallet UTXO refresh after a transaction.
   * This prevents "Insufficient funds" errors from UTXO race conditions
   * when sending multiple transactions in quick succession.
   * @private
   * @param {number} [delayMs=1500] - Initial delay to wait
   * @param {number} [maxWaitMs=5000] - Maximum total wait time
   */
  async _waitForUtxoRefresh(delayMs = 1500, maxWaitMs = 5000) {
    const portal = this.sm?.portal;
    if (!portal) {
      console.warn("KKTP Lobby: No portal available for UTXO refresh");
      return;
    }

    console.info("KKTP Lobby: Waiting for UTXO refresh...");
    const startTime = Date.now();

    // Initial delay to allow transaction to propagate
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Poll for balance availability (indicates UTXOs are ready)
    let attempts = 0;
    const maxAttempts = Math.ceil((maxWaitMs - delayMs) / 500);

    while (attempts < maxAttempts && Date.now() - startTime < maxWaitMs) {
      try {
        const balance = await portal.getBalance();
        if (balance && balance > 0n) {
          console.info("KKTP Lobby: UTXO refresh complete", {
            balance: balance.toString(),
            waitedMs: Date.now() - startTime,
          });
          return;
        }
      } catch (err) {
        // Ignore balance check errors, keep polling
        console.debug("KKTP Lobby: Balance check during UTXO wait", err.message);
      }
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.warn("KKTP Lobby: UTXO refresh timeout, proceeding anyway", {
      waitedMs: Date.now() - startTime,
    });
  }

  /**
   * Send a message with retry logic for transient failures.
   * Handles UTXO availability issues with exponential backoff.
   * @private
   * @param {string} mailboxId - Target mailbox
   * @param {string} message - Message to send
   * @param {number} [maxRetries=3] - Maximum retry attempts
   */
  async _sendWithRetry(mailboxId, message, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.info("KKTP Lobby: Send attempt", {
          attempt,
          maxRetries,
          mailboxId: mailboxId?.slice(0, 16),
        });
        await this.sm.sendMessage(mailboxId, message);
        return; // Success!
      } catch (err) {
        lastError = err;
        const isUtxoError =
          err.message?.includes("Insufficient funds") ||
          err.message?.includes("UTXO") ||
          err.message?.includes("no spendable");

        console.warn("KKTP Lobby: Send attempt failed", {
          attempt,
          maxRetries,
          error: err.message,
          isUtxoError,
        });

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.info("KKTP Lobby: Retrying in", { delayMs: delay });

          // Wait for UTXO refresh before retry if it's a UTXO error
          if (isUtxoError) {
            await this._waitForUtxoRefresh(delay, delay + 2000);
          } else {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    }

    // All retries exhausted
    throw lastError;
  }
}
