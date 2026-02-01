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
import { buildAnchorPayload } from "../protocol/sessions/index.js";

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

    // ─────────────────────────────────────────────────────────────
    // Key Vault - Epoch Versioning for key rotation race conditions
    // Keeps current + previous key to handle messages sent during rotation
    // ─────────────────────────────────────────────────────────────
    this._keyVault = {
      current: null, // { key: Uint8Array, version: number }
      previous: null, // { key: Uint8Array, version: number } - for receiving only
    };

    // ─────────────────────────────────────────────────────────────
    // Join Request Queue - Serializes concurrent joins to prevent UTXO contention
    // When multiple peers join simultaneously, the host must process them one at a time
    // ─────────────────────────────────────────────────────────────
    this._joinRequestQueue = []; // [{ dmMailboxId, request, resolve, queuedAt }]
    this._isProcessingJoinQueue = false;

    // Future message buffer for messages with key versions we haven't received yet
    // This handles the rare case where a message arrives before the key rotation DM
    this._futureMessageBuffer = []; // [{ encrypted, receivedAt }]
    this._futureBufferMaxSize = 20;
    this._futureBufferTtlMs = 60_000; // 1 minute TTL

    // ─────────────────────────────────────────────────────────────
    // DM Mailbox Tracking - Filters out DMs from unrelated peers
    // Prevents buffering/processing messages meant for other peers
    // ─────────────────────────────────────────────────────────────
    this._pendingJoinDmMailboxId = null; // Set during joinLobby while waiting for response
    this._hostDmMailboxId = null; // Set when member joins - the mailbox for receiving host DMs

    // ─────────────────────────────────────────────────────────────
    // Prefix Subscription Tracking - Self-contained subscription management
    // Tracks all prefixes this lobby has subscribed to for proper cleanup
    // ─────────────────────────────────────────────────────────────
    this._subscribedPrefixes = new Set(); // All KKTP prefixes we're subscribed to
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
   * Routes through the join queue to ensure proper UTXO serialization.
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

    // Route through the queue to ensure UTXO serialization
    return new Promise((resolve) => {
      this._joinRequestQueue.push({
        dmMailboxId: pending.dmMailboxId,
        request: pending.request,
        resolve,
        queuedAt: Date.now(),
      });

      console.info("KKTP Lobby: Manual approval queued for processing", {
        pubSig: pubSig?.slice(0, 16),
        queueLength: this._joinRequestQueue.length,
      });

      this._processJoinQueue();
    });
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

      // ─────────────────────────────────────────────────────────────
      // Initialize Key Vault with initial key (no previous yet)
      // ─────────────────────────────────────────────────────────────
      this._keyVault = {
        current: { key: groupKey, version: 1 },
        previous: null,
      };
      this._futureMessageBuffer = [];

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
   * Queues requests to prevent UTXO contention when multiple peers join simultaneously.
   * @param {string} dmMailboxId - The 1:1 DM mailbox with the requesting peer
   * @param {Object} request - The join request message
   * @returns {Promise<boolean>} - Whether the join was queued/accepted
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

    // Check if already a member (immediate rejection, no queue needed)
    if (this.lobby.members.has(pubSig)) {
      console.warn("KKTP Lobby: Peer is already a member");
      return true; // Already a member, no action needed
    }

    // Check if already in queue or pending approval
    const alreadyQueued = this._joinRequestQueue.some(
      (item) => item.request.pubSig === pubSig
    );
    if (alreadyQueued || this._pendingJoins.has(pubSig)) {
      console.warn("KKTP Lobby: Join request already queued/pending", {
        pubSig: pubSig?.slice(0, 16),
      });
      return true;
    }

    // Queue the join request for serialized processing
    return new Promise((resolve) => {
      this._joinRequestQueue.push({
        dmMailboxId,
        request,
        resolve,
        queuedAt: Date.now(),
      });

      console.info("KKTP Lobby: Join request queued", {
        pubSig: pubSig?.slice(0, 16),
        displayName,
        queueLength: this._joinRequestQueue.length,
      });

      // Start processing if not already running
      this._processJoinQueue();
    });
  }

  /**
   * Process the join request queue serially
   * Ensures only one join is processed at a time to prevent UTXO contention
   * @private
   */
  async _processJoinQueue() {
    // Prevent concurrent queue processing
    if (this._isProcessingJoinQueue) {
      return;
    }

    this._isProcessingJoinQueue = true;

    try {
      while (this._joinRequestQueue.length > 0) {
        const { dmMailboxId, request, resolve } = this._joinRequestQueue.shift();
        const { pubSig, displayName } = request;

        console.info("KKTP Lobby: Processing queued join request", {
          pubSig: pubSig?.slice(0, 16),
          displayName,
          remainingInQueue: this._joinRequestQueue.length,
        });

        // Check if lobby state is still valid
        if (this.state !== LOBBY_STATES.HOSTING || !this.lobby) {
          console.warn("KKTP Lobby: Lobby closed while processing queue");
          resolve(false);
          continue;
        }

        // Re-check capacity (may have changed while queued)
        if (this.lobby.members.size >= this.lobby.maxMembers) {
          console.warn("KKTP Lobby: Lobby full while processing queue");
          try {
            await this._sendJoinResponse(dmMailboxId, false, "Lobby is full");
          } catch (err) {
            console.warn("KKTP Lobby: Failed to send rejection", { error: err.message });
          }
          resolve(false);
          continue;
        }

        // Re-check if already a member (may have joined via another path)
        if (this.lobby.members.has(pubSig)) {
          console.warn("KKTP Lobby: Already member while processing queue");
          resolve(true);
          continue;
        }

        // Process based on autoAcceptJoins setting
        if (this.autoAcceptJoins) {
          try {
            const result = await this._acceptJoinRequest(dmMailboxId, request);
            resolve(result);
          } catch (err) {
            console.error("KKTP Lobby: Error accepting join request", {
              pubSig: pubSig?.slice(0, 16),
              error: err.message,
            });
            resolve(false);
          }
        } else {
          // Store for manual approval
          this._pendingJoins.set(pubSig, {
            dmMailboxId,
            request,
            receivedAt: Date.now(),
          });

          // Emit event for UI to handle
          if (this._onJoinRequest) {
            const acceptFn = () => this.acceptPendingJoin(pubSig);
            const rejectFn = (reason) => this.rejectPendingJoin(pubSig, reason);
            this._onJoinRequest(request, acceptFn, rejectFn);
          }

          console.info("KKTP Lobby: Join request pending approval", {
            pubSig: pubSig?.slice(0, 16),
            displayName,
          });

          resolve(true); // Queued for manual approval
        }

        // Wait for UTXO refresh before processing next request
        // This is critical to prevent UTXO contention
        if (this._joinRequestQueue.length > 0) {
          console.info("KKTP Lobby: Waiting for UTXO refresh before next join", {
            remainingInQueue: this._joinRequestQueue.length,
          });
          await this._waitForUtxoRefresh(1500, 5000);
        }
      }
    } finally {
      this._isProcessingJoinQueue = false;
    }
  }

  /**
   * Internal: Accept a join request and add member to lobby
   * Called from the serialized queue processor to prevent UTXO contention.
   * @private
   */
  async _acceptJoinRequest(dmMailboxId, request) {
    const { pubSig, displayName } = request;

    // Create member entry BEFORE sending response
    // This ensures the member list in the response includes the new member
    const member = {
      pubSig,
      displayName: displayName || `Peer ${pubSig.slice(0, 8)}`,
      role: MEMBER_ROLES.MEMBER,
      joinedAt: Date.now(),
      dmMailboxId,
    };

    // Add to roster first (so response includes correct member count)
    this.lobby.members.set(pubSig, member);

    // Prepare member list for response (includes the new member)
    const memberList = this._exportMemberList();

    // Send join response with group key
    try {
      await this._sendJoinResponse(dmMailboxId, true, "Welcome", {
        groupKey: this._exportGroupKey(),
        keyVersion: this.lobby.keyVersion,
        groupMailboxId: this.lobby.groupMailboxId,
        lobbyId: this.lobby.lobbyId,
        lobbyName: this.lobby.lobbyName,
        hostPubSig: this.lobby.hostPubSig,
        maxMembers: this.lobby.maxMembers,
        members: memberList,
      });
    } catch (err) {
      // If we fail to send response, remove member from roster (rollback)
      console.error("KKTP Lobby: Failed to send join response, removing member", {
        pubSig: pubSig.slice(0, 16),
        error: err.message,
      });
      this.lobby.members.delete(pubSig);
      throw err;
    }

    // Wait for UTXO refresh before broadcasting member event
    await this._waitForUtxoRefresh(1500, 5000);

    // Broadcast member join to existing members (excluding the new member)
    try {
      await this._broadcastMemberEvent("join", member);
    } catch (err) {
      console.warn("KKTP Lobby: Failed to broadcast member event (non-fatal)", {
        pubSig: pubSig.slice(0, 16),
        error: err.message,
      });
      // Don't remove member - they're already in, just missed the broadcast
    }

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
   *
   * Order of operations (session_end is LAST):
   * 1. Send kick notification to the member via DM
   * 2. Broadcast member leave event to remaining members
   * 3. Rotate key for forward secrecy (kicked member can't decrypt new messages)
   * 4. ONLY AFTER all above succeed: End the 1:1 DM session with the kicked member
   *
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

    const dmMailboxId = member.dmMailboxId;

    console.info("KKTP Lobby: Kicking member", {
      pubSig: pubSig.slice(0, 16),
      displayName: member.displayName,
      dmMailboxId: dmMailboxId?.slice(0, 16),
      reason,
    });

    // ─────────────────────────────────────────────────────────────
    // Step 1: Notify the kicked member via DM (must complete first)
    // ─────────────────────────────────────────────────────────────
    if (dmMailboxId) {
      try {
        await this._sendWithRetry(
          dmMailboxId,
          JSON.stringify({
            type: "lobby_kicked",
            version: LOBBY_VERSION,
            lobbyId: this.lobby.lobbyId,
            reason,
            timestamp: Date.now(),
          }),
          3, // More retries to ensure delivery
        );
        console.info("KKTP Lobby: Kick notification sent", {
          pubSig: pubSig.slice(0, 16),
        });
      } catch (err) {
        console.warn("KKTP Lobby: Failed to notify kicked member", {
          pubSig: pubSig.slice(0, 16),
          error: err.message,
        });
        // Continue anyway - member will be out of sync but that's acceptable
      }

      // Wait for UTXO refresh before next operation
      await this._waitForUtxoRefresh(1500, 3000);
    }

    // ─────────────────────────────────────────────────────────────
    // Step 2: Remove from roster (must happen before key rotation)
    // ─────────────────────────────────────────────────────────────
    this.lobby.members.delete(pubSig);

    // ─────────────────────────────────────────────────────────────
    // Step 3: Broadcast member leave to remaining members
    // ─────────────────────────────────────────────────────────────
    try {
      await this._broadcastMemberEvent("leave", { pubSig, reason });
      console.info("KKTP Lobby: Member leave event broadcast", {
        pubSig: pubSig.slice(0, 16),
      });
    } catch (err) {
      console.warn("KKTP Lobby: Failed to broadcast member leave", {
        pubSig: pubSig.slice(0, 16),
        error: err.message,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Step 4: Rotate key for forward secrecy
    // This ensures kicked member can't decrypt future messages
    // ─────────────────────────────────────────────────────────────
    try {
      await this.rotateKey("Member kicked - forward secrecy");
      console.info("KKTP Lobby: Key rotated after kick", {
        pubSig: pubSig.slice(0, 16),
        newKeyVersion: this.lobby.keyVersion,
      });
    } catch (err) {
      console.error("KKTP Lobby: Failed to rotate key after kick", {
        pubSig: pubSig.slice(0, 16),
        error: err.message,
      });
      // Continue anyway - security is degraded but kick should complete
    }

    // ─────────────────────────────────────────────────────────────
    // Step 5: LAST STEP - End the 1:1 DM session (after all above)
    // This is the final acknowledgment that the kick is complete
    // ─────────────────────────────────────────────────────────────
    if (dmMailboxId) {
      await this._waitForUtxoRefresh(1500, 3000);

      try {
        await this._endDMSession(dmMailboxId, reason);
        console.info("KKTP Lobby: DM session ended with kicked member", {
          pubSig: pubSig.slice(0, 16),
          dmMailboxId: dmMailboxId.slice(0, 16),
        });
      } catch (err) {
        console.warn("KKTP Lobby: Failed to end DM session after kick", {
          pubSig: pubSig.slice(0, 16),
          error: err.message,
        });
        // This is truly the last step, so we just log the failure
      }
    }

    // Emit event
    this._onMemberLeave?.(pubSig, reason);

    console.info("KKTP Lobby: Member kicked successfully", {
      pubSig: pubSig.slice(0, 16),
      remainingMembers: this.lobby.members.size,
      reason,
    });
  }

  /**
   * Rotate the group key (host only)
   * Distributes new key to ALL members before updating local state.
   * Uses Key Vault to keep previous key for receiving late messages.
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

    // Collect all members that need the key (excluding host)
    const membersToNotify = [];
    for (const [pubSig, member] of this.lobby.members) {
      if (member.role === MEMBER_ROLES.HOST) continue;
      if (!member.dmMailboxId) {
        console.warn("KKTP Lobby: Member missing dmMailboxId, skipping", {
          pubSig: pubSig.slice(0, 16),
        });
        continue;
      }
      membersToNotify.push({ pubSig, member });
    }

    console.info("KKTP Lobby: Starting key rotation distribution", {
      keyVersion: newVersion,
      memberCount: membersToNotify.length,
      reason,
    });

    // Track delivery results
    let successCount = 0;
    let failCount = 0;
    const failedMembers = [];

    // Send to ALL members BEFORE updating local state
    // This ensures everyone gets the same key version
    // CRITICAL: Serialize sends with UTXO refresh between each to prevent contention
    for (let i = 0; i < membersToNotify.length; i++) {
      const { pubSig, member } = membersToNotify[i];

      // Wait for UTXO refresh before each send (except the first)
      if (i > 0) {
        await this._waitForUtxoRefresh(1000, 3000);
      }

      try {
        await this._sendWithRetry(member.dmMailboxId, distributionJson, 3);
        successCount++;
        console.info("KKTP Lobby: Key rotation sent to member", {
          pubSig: pubSig.slice(0, 16),
          keyVersion: newVersion,
          dmMailboxId: member.dmMailboxId?.slice(0, 16),
        });
      } catch (err) {
        failCount++;
        failedMembers.push(pubSig);
        console.error("KKTP Lobby: Failed to send key rotation to member", {
          pubSig: pubSig.slice(0, 16),
          dmMailboxId: member.dmMailboxId?.slice(0, 16),
          error: err.message,
        });
      }
    }

    // Only update local state if at least one member received the key
    // If ALL failed, abort rotation to avoid leaving everyone out of sync
    if (successCount === 0 && membersToNotify.length > 0) {
      console.error("KKTP Lobby: Key rotation aborted - no members received new key", {
        attemptedCount: membersToNotify.length,
      });
      throw new Error("Key rotation failed: no members received new key");
    }

    // ─────────────────────────────────────────────────────────────
    // Key Vault Update: current → previous, new → current
    // ─────────────────────────────────────────────────────────────
    this._keyVault.previous = this._keyVault.current;
    this._keyVault.current = {
      key: newKey,
      version: newVersion,
    };

    // Update legacy state for backward compatibility
    this.lobby.groupKey = newKey;
    this.lobby.keyVersion = newVersion;

    // Emit event
    this._onKeyRotation?.(newVersion);

    console.info("KKTP Lobby: Key rotated", {
      version: newVersion,
      previousVersion: this._keyVault.previous?.version ?? "none",
      reason,
      memberCount: this.lobby.members.size,
      successCount,
      failCount,
      failedMembers: failedMembers.map((p) => p.slice(0, 16)),
    });

    // Warn about members who missed the rotation
    if (failedMembers.length > 0) {
      console.warn("KKTP Lobby: Some members missed key rotation - they may be out of sync", {
        failedMembers: failedMembers.map((p) => p.slice(0, 16)),
      });
    }
  }

  /**
   * Close the lobby (host only)
   *
   * Single-Shot Close Strategy:
   * - Broadcasts a single LOBBY_CLOSE to the Group Mailbox (not N individual DMs)
   * - Every member sees this on the ledger and cleans up their own local session vault
   * - Host doesn't need to "handshake" members out individually
   *
   * @param {string} [reason="Lobby closed by host"]
   */
  async closeLobby(reason = "Lobby closed by host") {
    if (this.state !== LOBBY_STATES.HOSTING) {
      throw new Error("Only host can close lobby");
    }

    if (!this.lobby?.groupMailboxId) {
      throw new Error("No lobby to close");
    }

    console.info("KKTP Lobby: Closing lobby (single-shot broadcast)", {
      lobbyId: this.lobby.lobbyId?.slice(0, 16),
      lobbyName: this.lobby.lobbyName,
      memberCount: this.lobby.members.size,
      reason,
    });

    // Stop key rotation first
    this._stopKeyRotation();

    // Build the close notification
    const closeMsg = {
      type: "lobby_close",
      version: LOBBY_VERSION,
      lobbyId: this.lobby.lobbyId,
      hostPubSig: this.lobby.hostPubSig,
      reason,
      timestamp: Date.now(),
    };

    // Broadcast to group mailbox (single transaction, all members see it)
    try {
      const payload = `KKTP:GROUP:${this.lobby.groupMailboxId}:${JSON.stringify(closeMsg)}`;
      const address = await this.sm.adapter.getAddress();

      await this.sm.adapter.send({
        toAddress: address,
        amount: "1",
        payload,
      });

      console.info("KKTP Lobby: Close notification broadcast to group mailbox", {
        groupMailboxId: this.lobby.groupMailboxId?.slice(0, 16),
      });
    } catch (err) {
      console.warn("KKTP Lobby: Failed to broadcast close notification", {
        error: err.message,
      });
      // Continue with cleanup even if broadcast fails
    }

    // Wait for broadcast to propagate before cleanup
    await this._waitForUtxoRefresh(1500, 3000);

    // Emit event before cleanup so UI can react
    this._onLobbyClose?.(reason);

    // Clean up local state (unsubscribes from prefixes, clears members, etc.)
    this._cleanup();

    console.info("KKTP Lobby: Closed successfully", { reason });
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

      // Track the DM mailbox for filtering incoming messages
      this._pendingJoinDmMailboxId = dmMailboxId;

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

    // Store host DM mailbox for filtering incoming key rotations/member events
    this._hostDmMailboxId = dmMailboxId;
    this._pendingJoinDmMailboxId = null; // Clear pending since we're now joined

    // ─────────────────────────────────────────────────────────────
    // Initialize Key Vault with received key (no previous yet)
    // ─────────────────────────────────────────────────────────────
    this._keyVault = {
      current: { key: this.lobby.groupKey, version: keyVersion },
      previous: null,
    };
    this._futureMessageBuffer = [];

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
   * Uses Key Vault to keep previous key for receiving late messages.
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

    const newKey = this._hexToUint8(rotation.groupKey);
    const newVersion = rotation.keyVersion;

    // ─────────────────────────────────────────────────────────────
    // Key Vault Update: current → previous, new → current
    // ─────────────────────────────────────────────────────────────
    this._keyVault.previous = this._keyVault.current;
    this._keyVault.current = {
      key: newKey,
      version: newVersion,
    };

    // Update legacy state for backward compatibility
    this.lobby.groupKey = newKey;
    this.lobby.keyVersion = newVersion;

    // Emit event
    this._onKeyRotation?.(newVersion);

    console.info("KKTP Lobby: Key updated", {
      version: newVersion,
      previousVersion: this._keyVault.previous?.version ?? "none",
      reason: rotation.reason,
    });

    // Process any buffered future messages that were waiting for this key
    this._processBufferedFutureMessages();
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
   * Handle being kicked from lobby (member only)
   * Cleans up both lobby state and the 1:1 DM session with the host.
   * @param {Object} kickMsg - Kick message
   */
  async handleKicked(kickMsg) {
    if (this.state !== LOBBY_STATES.MEMBER) {
      console.debug("KKTP Lobby: Ignoring kick (not a member)", {
        currentState: this.state,
      });
      return;
    }

    if (kickMsg.lobbyId !== this.lobby?.lobbyId) {
      console.debug("KKTP Lobby: Ignoring kick for different lobby", {
        kickLobbyId: kickMsg.lobbyId?.slice(0, 16),
        ourLobbyId: this.lobby?.lobbyId?.slice(0, 16),
      });
      return;
    }

    const reason = kickMsg.reason || "Kicked by host";
    const hostDmMailboxId = this._hostDmMailboxId;

    console.warn("KKTP Lobby: Kicked from lobby", {
      lobbyId: this.lobby.lobbyId?.slice(0, 16),
      lobbyName: this.lobby.lobbyName,
      reason,
      hostDmMailboxId: hostDmMailboxId?.slice(0, 16),
    });

    // Emit event before cleanup so UI can react
    this._onLobbyClose?.(reason);

    // Clean up lobby state (unsubscribes from group mailbox, clears vault, etc.)
    this._cleanup();

    // End the 1:1 DM session with the host
    // This happens AFTER lobby cleanup to ensure we don't receive more messages
    if (hostDmMailboxId) {
      try {
        await this._endDMSession(hostDmMailboxId, reason);
        console.info("KKTP Lobby: Ended DM session with host after kick", {
          dmMailboxId: hostDmMailboxId.slice(0, 16),
        });
      } catch (err) {
        console.warn("KKTP Lobby: Failed to end host DM session after kick", {
          error: err.message,
        });
      }
    }

    console.info("KKTP Lobby: Cleanup complete after kick");
  }

  /**
   * Handle lobby close notification (member only)
   * Can receive this via DM (old path) or via group mailbox (new single-shot path).
   * Cleans up both lobby state and the 1:1 DM session with the host.
   * @param {Object} closeMsg - Close message
   */
  async handleLobbyClose(closeMsg) {
    if (this.state !== LOBBY_STATES.MEMBER) {
      console.debug("KKTP Lobby: Ignoring lobby close (not a member)", {
        currentState: this.state,
      });
      return;
    }

    if (closeMsg.lobbyId !== this.lobby?.lobbyId) {
      console.debug("KKTP Lobby: Ignoring close for different lobby", {
        closeLobbyId: closeMsg.lobbyId?.slice(0, 16),
        ourLobbyId: this.lobby?.lobbyId?.slice(0, 16),
      });
      return;
    }

    const reason = closeMsg.reason || "Lobby closed by host";
    const hostDmMailboxId = this._hostDmMailboxId;

    console.info("KKTP Lobby: Lobby closed by host", {
      lobbyId: this.lobby.lobbyId?.slice(0, 16),
      lobbyName: this.lobby.lobbyName,
      reason,
      hostDmMailboxId: hostDmMailboxId?.slice(0, 16),
    });

    // Emit event before cleanup so UI can react
    this._onLobbyClose?.(reason);

    // Clean up lobby state (unsubscribes from group mailbox, clears vault, etc.)
    this._cleanup();

    // End the 1:1 DM session with the host
    // This happens AFTER lobby cleanup to ensure we don't receive more messages
    if (hostDmMailboxId) {
      try {
        await this._endDMSession(hostDmMailboxId, reason);
        console.info("KKTP Lobby: Ended DM session with host after close", {
          dmMailboxId: hostDmMailboxId.slice(0, 16),
        });
      } catch (err) {
        console.warn("KKTP Lobby: Failed to end host DM session after close", {
          error: err.message,
        });
      }
    }

    console.info("KKTP Lobby: Cleanup complete after lobby close");
  }

  /**
   * Leave the lobby voluntarily (member only)
   * Sends leave notification to host and cleans up the 1:1 DM session.
   * @param {string} [reason="Left voluntarily"]
   */
  async leaveLobby(reason = "Left voluntarily") {
    if (this.state !== LOBBY_STATES.MEMBER) {
      throw new Error("Not a lobby member");
    }

    if (!this.lobby) {
      throw new Error("No lobby to leave");
    }

    const hostDmMailboxId = this.lobby.dmMailboxId || this._hostDmMailboxId;

    console.info("KKTP Lobby: Leaving lobby", {
      lobbyId: this.lobby.lobbyId?.slice(0, 16),
      lobbyName: this.lobby.lobbyName,
      reason,
      hostDmMailboxId: hostDmMailboxId?.slice(0, 16),
    });

    // ─────────────────────────────────────────────────────────────
    // Step 1: Notify host via DM (best-effort)
    // ─────────────────────────────────────────────────────────────
    if (hostDmMailboxId) {
      try {
        const myKeys = await this.sm.adapter.generateIdentityKeys(0);
        if (!myKeys?.sig?.publicKey) {
          throw new Error("Failed to get identity keys");
        }
        await this._sendWithRetry(
          hostDmMailboxId,
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
        console.info("KKTP Lobby: Leave notification sent to host");
      } catch (err) {
        console.warn("KKTP Lobby: Failed to notify host of leave", {
          error: err.message,
        });
        // Continue with cleanup anyway
      }

      // Wait for UTXO refresh before ending session
      await this._waitForUtxoRefresh(1500, 3000);
    }

    // Emit event before cleanup
    this._onLobbyClose?.(reason);

    // ─────────────────────────────────────────────────────────────
    // Step 2: Clean up lobby state (unsubscribe from group, clear vault)
    // ─────────────────────────────────────────────────────────────
    this._cleanup();

    // ─────────────────────────────────────────────────────────────
    // Step 3: End the 1:1 DM session with the host (LAST step)
    // ─────────────────────────────────────────────────────────────
    if (hostDmMailboxId) {
      try {
        await this._endDMSession(hostDmMailboxId, reason);
        console.info("KKTP Lobby: Ended DM session with host", {
          dmMailboxId: hostDmMailboxId.slice(0, 16),
        });
      } catch (err) {
        console.warn("KKTP Lobby: Failed to end host DM session", {
          error: err.message,
        });
      }
    }

    console.info("KKTP Lobby: Left lobby successfully", { reason });
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

    const myKeys = await this.sm.adapter.generateIdentityKeys(0);
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
    const address = await this.sm.adapter.getAddress();
    const result = await this.sm.adapter.send({
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
   * Process an incoming group message using Epoch Versioning
   *
   * Key matching strategy:
   * 1. Try current key (exact version match)
   * 2. Try previous key (for messages sent during rotation propagation)
   * 3. Buffer future versions (message arrived before key rotation DM)
   * 4. Drop expired versions (more than 1 behind previous)
   *
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

    const msgVersion = encrypted.keyVersion;
    const currentVersion = this._keyVault.current?.version ?? this.lobby.keyVersion;
    const previousVersion = this._keyVault.previous?.version ?? null;

    // ─────────────────────────────────────────────────────────────
    // Case 1: Current key (exact match)
    // ─────────────────────────────────────────────────────────────
    if (msgVersion === currentVersion && this._keyVault.current?.key) {
      console.debug("KKTP Lobby: Decrypting with current key", {
        keyVersion: msgVersion,
        senderPubSig: encrypted.senderPubSig?.slice(0, 16),
      });
      await this._decryptAndProcessMessage(encrypted, this._keyVault.current.key);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // Case 2: Previous key (message sent during rotation propagation)
    // ─────────────────────────────────────────────────────────────
    if (previousVersion !== null && msgVersion === previousVersion && this._keyVault.previous?.key) {
      console.info("KKTP Lobby: Decrypting with previous key (rotation in progress)", {
        msgVersion,
        currentVersion,
        previousVersion,
        senderPubSig: encrypted.senderPubSig?.slice(0, 16),
      });
      await this._decryptAndProcessMessage(encrypted, this._keyVault.previous.key);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // Case 3: Future version (message arrived before key rotation DM)
    // Buffer it and process when we receive the key
    // ─────────────────────────────────────────────────────────────
    if (msgVersion > currentVersion) {
      console.info("KKTP Lobby: Buffering future message (awaiting key rotation)", {
        msgVersion,
        currentVersion,
        senderPubSig: encrypted.senderPubSig?.slice(0, 16),
      });
      this._bufferFutureMessage(encrypted);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // Case 4: Expired version (too old to decrypt)
    // ─────────────────────────────────────────────────────────────
    console.warn("KKTP Lobby: Dropping expired message (key version too old)", {
      msgVersion,
      currentVersion,
      previousVersion,
      senderPubSig: encrypted.senderPubSig?.slice(0, 16),
    });
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

  /**
   * Broadcast a member event to all other members
   * Serializes sends with UTXO refresh between each to prevent contention
   * @private
   */
  async _broadcastMemberEvent(eventType, member) {
    if (!this.lobby || this.state !== LOBBY_STATES.HOSTING) return;

    const event = {
      type: "lobby_member_event",
      version: LOBBY_VERSION,
      lobbyId: this.lobby.lobbyId,
      eventType,
      pubSig: member.pubSig,
      displayName: member.displayName,
      role: member.role,
      joinedAt: member.joinedAt,
      reason: member.reason,
      timestamp: Date.now(),
    };

    const eventJson = JSON.stringify(event);

    // Collect recipients (exclude host and the member in question)
    const recipients = [];
    for (const [pubSig, m] of this.lobby.members) {
      if (m.role === MEMBER_ROLES.HOST) continue;
      if (pubSig === member.pubSig) continue; // Don't notify the member about themselves
      if (!m.dmMailboxId) continue;
      recipients.push({ pubSig, dmMailboxId: m.dmMailboxId });
    }

    if (recipients.length === 0) {
      console.debug("KKTP Lobby: No recipients for member event broadcast");
      return;
    }

    console.info("KKTP Lobby: Broadcasting member event", {
      eventType,
      memberPubSig: member.pubSig?.slice(0, 16),
      recipientCount: recipients.length,
    });

    // Send to each recipient serially with UTXO refresh between
    for (let i = 0; i < recipients.length; i++) {
      const { pubSig, dmMailboxId } = recipients[i];

      try {
        await this._sendWithRetry(dmMailboxId, eventJson, 3);
        console.debug("KKTP Lobby: Member event sent", {
          eventType,
          to: pubSig.slice(0, 16),
        });
      } catch (err) {
        console.warn("KKTP Lobby: Failed to send member event", {
          to: pubSig.slice(0, 16),
          error: err.message,
        });
      }

      // Wait for UTXO refresh before next send (except for last recipient)
      if (i < recipients.length - 1) {
        await this._waitForUtxoRefresh(1000, 3000);
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

  // ─────────────────────────────────────────────────────────────
  // Epoch Versioning Helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Decrypt a group message with a specific key and emit the result.
   * Used by processGroupMessage() for both current and previous keys.
   * @private
   * @param {Object} encrypted - The encrypted message
   * @param {Uint8Array} key - The key to use for decryption
   */
  async _decryptAndProcessMessage(encrypted, key) {
    try {
      const decrypted = await this.codec.decryptGroupMessage(
        encrypted,
        key,
        this.lobby.groupMailboxId,
      );

      // Add to history with nonce for potential future deduplication
      this._addToHistory({
        type: "inbound",
        senderPubSig: encrypted.senderPubSig,
        plaintext: decrypted,
        timestamp: encrypted.timestamp || Date.now(),
        nonce: encrypted.nonce,
        keyVersion: encrypted.keyVersion,
      });

      // Emit event
      this._onGroupMessage?.({
        senderPubSig: encrypted.senderPubSig,
        plaintext: decrypted,
        timestamp: encrypted.timestamp,
        senderName: this.lobby.members.get(encrypted.senderPubSig)?.displayName,
      });
    } catch (err) {
      console.warn("KKTP Lobby: Failed to decrypt group message", {
        error: err.message,
        keyVersion: encrypted.keyVersion,
        senderPubSig: encrypted.senderPubSig?.slice(0, 16),
      });
    }
  }

  /**
   * Buffer a message with a future key version for later processing.
   * Called when we receive a message before the key rotation DM.
   * @private
   * @param {Object} encrypted - The encrypted message to buffer
   */
  _bufferFutureMessage(encrypted) {
    const now = Date.now();

    // Clean up expired messages first
    this._futureMessageBuffer = this._futureMessageBuffer.filter(
      (entry) => now - entry.receivedAt < this._futureBufferTtlMs
    );

    // Enforce size limit
    if (this._futureMessageBuffer.length >= this._futureBufferMaxSize) {
      console.warn("KKTP Lobby: Future message buffer full, dropping oldest");
      this._futureMessageBuffer.shift();
    }

    this._futureMessageBuffer.push({
      encrypted,
      receivedAt: now,
    });

    console.debug("KKTP Lobby: Buffered future message", {
      bufferSize: this._futureMessageBuffer.length,
      keyVersion: encrypted.keyVersion,
      senderPubSig: encrypted.senderPubSig?.slice(0, 16),
    });
  }

  /**
   * Process any buffered future messages that can now be decrypted.
   * Called after receiving a key rotation that might unlock buffered messages.
   * @private
   */
  _processBufferedFutureMessages() {
    if (this._futureMessageBuffer.length === 0) return;

    const currentVersion = this._keyVault.current?.version;
    const previousVersion = this._keyVault.previous?.version;
    const now = Date.now();

    console.info("KKTP Lobby: Processing buffered future messages", {
      bufferSize: this._futureMessageBuffer.length,
      currentVersion,
      previousVersion,
    });

    // Partition: process now vs keep vs drop
    const toProcess = [];
    const toKeep = [];

    for (const entry of this._futureMessageBuffer) {
      const { encrypted, receivedAt } = entry;

      // Drop expired entries
      if (now - receivedAt >= this._futureBufferTtlMs) {
        console.debug("KKTP Lobby: Dropping expired buffered message", {
          keyVersion: encrypted.keyVersion,
          ageMs: now - receivedAt,
        });
        continue;
      }

      // Can we decrypt now?
      if (encrypted.keyVersion === currentVersion) {
        toProcess.push({ encrypted, key: this._keyVault.current.key });
      } else if (previousVersion !== null && encrypted.keyVersion === previousVersion) {
        toProcess.push({ encrypted, key: this._keyVault.previous.key });
      } else if (encrypted.keyVersion > currentVersion) {
        // Still future, keep buffered
        toKeep.push(entry);
      } else {
        // Now expired (too old)
        console.debug("KKTP Lobby: Dropping now-expired buffered message", {
          msgVersion: encrypted.keyVersion,
          currentVersion,
          previousVersion,
        });
      }
    }

    // Update buffer
    this._futureMessageBuffer = toKeep;

    // Process unlocked messages
    for (const { encrypted, key } of toProcess) {
      console.info("KKTP Lobby: Processing previously-buffered message", {
        keyVersion: encrypted.keyVersion,
        senderPubSig: encrypted.senderPubSig?.slice(0, 16),
      });
      // Fire and forget - errors are logged in _decryptAndProcessMessage
      this._decryptAndProcessMessage(encrypted, key);
    }

    console.info("KKTP Lobby: Finished processing buffered messages", {
      processed: toProcess.length,
      remaining: toKeep.length,
    });
  }

  /**
   * Get the current user's public signing key
   * @returns {Promise<string|null>}
   * @private
   */
  async _getMyPubSig() {
    try {
      const myKeys = await this.sm.adapter.generateIdentityKeys(0);
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

  // ─────────────────────────────────────────────────────────────
  // Simplified Payload Processing - Self-contained integration API
  // ─────────────────────────────────────────────────────────────

  /**
   * Categorize a raw KKTP payload to determine how to process it.
   * Returns categorization info for routing decisions.
   *
   * This is a pure categorization method - it doesn't process the message,
   * just tells you what type it is and provides parsed components.
   *
   * @param {string} rawPayload - Raw KKTP payload string
   * @returns {{
   *   type: 'anchor' | 'group' | 'dm' | 'unknown',
   *   mailboxId?: string,
   *   groupMailboxId?: string,
   *   encrypted?: Object,
   *   isRelevant?: boolean
   * }}
   */
  categorizePayload(rawPayload) {
    if (!rawPayload || typeof rawPayload !== "string") {
      return { type: "unknown" };
    }

    // Anchor messages (discovery, response, etc.)
    if (rawPayload.startsWith("KKTP:ANCHOR:")) {
      return { type: "anchor" };
    }

    // Group messages
    if (rawPayload.startsWith("KKTP:GROUP:")) {
      const parsed = this.parseGroupPayload(rawPayload);
      if (parsed.isGroup) {
        return {
          type: "group",
          groupMailboxId: parsed.groupMailboxId,
          encrypted: parsed.encrypted,
          isRelevant: this.isGroupPayloadForThisLobby(parsed.groupMailboxId),
        };
      }
      return { type: "unknown" };
    }

    // DM messages: KKTP:{mailboxId}:{encrypted}
    if (rawPayload.startsWith("KKTP:")) {
      const colonIdx = rawPayload.indexOf(":", 5); // After "KKTP:"
      if (colonIdx > 5) {
        const mailboxId = rawPayload.slice(5, colonIdx);
        return {
          type: "dm",
          mailboxId,
          isRelevant: this.isRelevantMailbox(mailboxId),
        };
      }
    }

    return { type: "unknown" };
  }

  /**
   * Process a group message payload for this lobby.
   * Handles the full flow: parse, validate, decrypt, and emit event.
   *
   * @param {string} rawPayload - Raw KKTP:GROUP payload
   * @returns {Promise<{ handled: boolean, message?: Object, error?: string }>}
   */
  async processGroupPayload(rawPayload) {
    const parsed = this.parseGroupPayload(rawPayload);

    if (!parsed.isGroup) {
      return { handled: false, error: "Not a group message" };
    }

    if (!this.isGroupPayloadForThisLobby(parsed.groupMailboxId)) {
      return { handled: false, error: "Not for this lobby" };
    }

    try {
      const handled = await this.routeGroupMessage(
        parsed.groupMailboxId,
        parsed.encrypted
      );

      if (handled) {
        // Return the latest message from history
        const latestMessage = this._messageHistory[this._messageHistory.length - 1];
        return { handled: true, message: latestMessage };
      }

      return { handled: false, error: "Failed to process group message" };
    } catch (err) {
      console.warn("KKTP Lobby: Error processing group payload", {
        error: err.message,
      });
      return { handled: false, error: err.message };
    }
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
   * Only buffers messages for mailboxes we know are relevant to this lobby.
   * @param {string} mailboxId - The DM mailbox ID
   * @param {string} payload - Raw payload to buffer
   * @param {number} [timestamp] - Message timestamp
   */
  bufferDMMessage(mailboxId, payload, timestamp) {
    // Only buffer if this mailbox is relevant to our lobby
    if (!this.isRelevantMailbox(mailboxId)) {
      // Not for us - silently ignore to avoid cluttering logs
      return;
    }

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
   * Check if a mailbox ID is relevant to this lobby.
   * Used to filter incoming DM messages - only process messages for:
   * - Our pending join DM (while waiting for join response)
   * - The host's DM (for receiving key rotations/member events as member)
   * - Known member DMs (for host to receive join requests/messages)
   * @param {string} mailboxId
   * @returns {boolean}
   */
  isRelevantMailbox(mailboxId) {
    if (!mailboxId) return false;

    // Check if it's our pending join DM (waiting for response from host)
    if (this._pendingJoinDmMailboxId && this._pendingJoinDmMailboxId === mailboxId) {
      return true;
    }

    // Check if it's the host's DM (for members receiving key rotations)
    if (this._hostDmMailboxId && this._hostDmMailboxId === mailboxId) {
      return true;
    }

    // Check if it's a known member's DM (for host)
    if (this._isKnownMemberMailbox(mailboxId)) {
      return true;
    }

    return false;
  }

  /**
   * Check if a mailbox ID belongs to a known lobby member.
   * @private
   * @param {string} mailboxId
   * @returns {boolean}
   */
  _isKnownMemberMailbox(mailboxId) {
    if (!mailboxId || !this.lobby?.members) return false;
    for (const member of this.lobby.members.values()) {
      if (member.dmMailboxId === mailboxId) return true;
    }
    return false;
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

    // Unsubscribe from all tracked prefixes (group mailbox, DM mailboxes, etc.)
    this._unsubscribeAllPrefixes();

    // Clear DM buffer and stop cleanup timer
    this._dmBuffer.clear();
    if (this._dmBufferCleanupTimer) {
      clearInterval(this._dmBufferCleanupTimer);
      this._dmBufferCleanupTimer = null;
    }

    // Clear Key Vault and future message buffer
    this._keyVault = { current: null, previous: null };
    this._futureMessageBuffer = [];

    // Clear and reject any pending join requests in the queue
    while (this._joinRequestQueue.length > 0) {
      const { resolve } = this._joinRequestQueue.shift();
      resolve(false);
    }
    this._isProcessingJoinQueue = false;

    this.lobby = null;
    this._pendingJoin = null;
    this._pendingJoins.clear();
    this._messageHistory = [];

    // Clear DM mailbox tracking
    this._hostDmMailboxId = null;
    this._pendingJoinDmMailboxId = null;

    this._setState(LOBBY_STATES.IDLE);
  }

  // ─────────────────────────────────────────────────────────────
  // Prefix Subscription Management - Self-contained subscription handling
  // ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to a KKTP prefix.
   * Tracks the subscription internally for proper cleanup.
   * @private
   * @param {string} prefix - Full KKTP prefix (e.g., 'KKTP:{mailboxId}:')
   */
  _subscribePrefix(prefix) {
    if (!prefix) return;

    // Already subscribed
    if (this._subscribedPrefixes.has(prefix)) {
      console.debug("KKTP Lobby: Already subscribed to prefix", {
        prefix: prefix.slice(0, 32),
      });
      return;
    }

    const adapter = this.sm?.adapter;
    if (!adapter?.addPrefix) {
      console.warn("KKTP Lobby: Cannot subscribe - adapter.addPrefix not available");
      return;
    }

    try {
      adapter.addPrefix(prefix);
      this._subscribedPrefixes.add(prefix);
      console.info("KKTP Lobby: Subscribed to prefix", {
        prefix: prefix.slice(0, 32),
        totalSubscriptions: this._subscribedPrefixes.size,
      });
    } catch (err) {
      console.error("KKTP Lobby: Failed to subscribe to prefix", {
        prefix: prefix.slice(0, 32),
        error: err.message,
      });
    }
  }

  /**
   * Unsubscribe from a KKTP prefix.
   * Removes from internal tracking.
   * @private
   * @param {string} prefix - Full KKTP prefix to unsubscribe from
   */
  _unsubscribePrefix(prefix) {
    if (!prefix) return;

    // Not subscribed
    if (!this._subscribedPrefixes.has(prefix)) {
      return;
    }

    const adapter = this.sm?.adapter;
    if (!adapter?.removePrefix) {
      console.debug("KKTP Lobby: Cannot unsubscribe - adapter.removePrefix not available");
      // Still remove from our tracking
      this._subscribedPrefixes.delete(prefix);
      return;
    }

    try {
      adapter.removePrefix(prefix);
      this._subscribedPrefixes.delete(prefix);
      console.info("KKTP Lobby: Unsubscribed from prefix", {
        prefix: prefix.slice(0, 32),
        remainingSubscriptions: this._subscribedPrefixes.size,
      });
    } catch (err) {
      console.warn("KKTP Lobby: Failed to unsubscribe from prefix", {
        prefix: prefix.slice(0, 32),
        error: err.message,
      });
      // Still remove from our tracking
      this._subscribedPrefixes.delete(prefix);
    }
  }

  /**
   * Unsubscribe from all tracked prefixes.
   * Called during cleanup to ensure no leaked subscriptions.
   * @private
   */
  _unsubscribeAllPrefixes() {
    if (this._subscribedPrefixes.size === 0) return;

    console.info("KKTP Lobby: Unsubscribing from all prefixes", {
      count: this._subscribedPrefixes.size,
    });

    // Copy the set to avoid modification during iteration
    const prefixes = [...this._subscribedPrefixes];
    for (const prefix of prefixes) {
      this._unsubscribePrefix(prefix);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DM Mailbox Subscription - For receiving 1:1 DMs
  // ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to a DM mailbox for receiving 1:1 messages.
   * Use this when establishing a DM session with the host or a member.
   * @param {string} mailboxId - The DM mailbox ID
   */
  subscribeToDMMailbox(mailboxId) {
    if (!mailboxId) {
      console.warn("KKTP Lobby: Cannot subscribe - no mailboxId");
      return;
    }

    const prefix = `KKTP:${mailboxId}:`;
    this._subscribePrefix(prefix);
  }

  /**
   * Unsubscribe from a DM mailbox.
   * @param {string} mailboxId - The DM mailbox ID
   */
  unsubscribeFromDMMailbox(mailboxId) {
    if (!mailboxId) return;
    const prefix = `KKTP:${mailboxId}:`;
    this._unsubscribePrefix(prefix);
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
    this._subscribePrefix(prefix);
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
    this._unsubscribePrefix(prefix);
  }

  /**
   * Get all currently subscribed prefixes.
   * Useful for debugging and verification.
   * @returns {string[]} Array of subscribed KKTP prefixes
   */
  getSubscribedPrefixes() {
    return [...this._subscribedPrefixes];
  }

  // ─────────────────────────────────────────────────────────────
  // Lobby State Export/Restore - For page refresh persistence
  // ─────────────────────────────────────────────────────────────

  /**
   * Export current lobby state for persistence.
   * Called by SessionVault.exportSessions() to include lobby state.
   * @returns {Object|null} Serializable lobby state, or null if no active lobby
   */
  exportLobbyState() {
    if (!this.lobby || this.state === LOBBY_STATES.IDLE) {
      return null;
    }

    // Serialize members Map to array
    const membersArray = [];
    for (const [pubSig, member] of this.lobby.members.entries()) {
      membersArray.push({
        pubSig: member.pubSig,
        displayName: member.displayName,
        role: member.role,
        joinedAt: member.joinedAt,
        dmMailboxId: member.dmMailboxId || null,
      });
    }

    const snapshot = {
      version: 1,
      state: this.state,
      lobby: {
        lobbyId: this.lobby.lobbyId,
        lobbyName: this.lobby.lobbyName,
        hostPubSig: this.lobby.hostPubSig,
        groupKey: this._uint8ToHex(this.lobby.groupKey),
        keyVersion: this.lobby.keyVersion,
        groupMailboxId: this.lobby.groupMailboxId,
        maxMembers: this.lobby.maxMembers,
        createdAt: this.lobby.createdAt,
        dmMailboxId: this.lobby.dmMailboxId || null, // Members have this
        members: membersArray,
      },
      keyVault: {
        current: this._keyVault.current
          ? {
              key: this._uint8ToHex(this._keyVault.current.key),
              version: this._keyVault.current.version,
            }
          : null,
        previous: this._keyVault.previous
          ? {
              key: this._uint8ToHex(this._keyVault.previous.key),
              version: this._keyVault.previous.version,
            }
          : null,
      },
      subscribedPrefixes: [...this._subscribedPrefixes],
      hostDmMailboxId: this._hostDmMailboxId || null,
      savedAt: Date.now(),
    };

    console.info("KKTP Lobby: exportLobbyState", {
      state: this.state,
      lobbyId: this.lobby.lobbyId?.slice(0, 16),
      memberCount: membersArray.length,
      prefixCount: this._subscribedPrefixes.size,
    });

    return snapshot;
  }

  /**
   * Restore lobby state from a previously exported snapshot.
   * Called by SessionVault.restoreSessions() after restoring 1:1 sessions.
   * @param {Object} snapshot - Previously exported lobby state
   * @returns {Promise<boolean>} True if restore succeeded
   */
  async restoreLobbyState(snapshot) {
    if (!snapshot || !snapshot.lobby) {
      console.info("KKTP Lobby: No lobby state to restore");
      return false;
    }

    try {
      const { lobby, state, keyVault, subscribedPrefixes, hostDmMailboxId } =
        snapshot;

      // Rebuild members Map from array
      const membersMap = new Map();
      if (Array.isArray(lobby.members)) {
        for (const m of lobby.members) {
          membersMap.set(m.pubSig, {
            pubSig: m.pubSig,
            displayName: m.displayName,
            role: m.role,
            joinedAt: m.joinedAt,
            dmMailboxId: m.dmMailboxId || null,
          });
        }
      }

      // Restore lobby object
      this.lobby = {
        lobbyId: lobby.lobbyId,
        lobbyName: lobby.lobbyName,
        hostPubSig: lobby.hostPubSig,
        members: membersMap,
        groupKey: this._hexToUint8(lobby.groupKey),
        keyVersion: lobby.keyVersion,
        groupMailboxId: lobby.groupMailboxId,
        maxMembers: lobby.maxMembers,
        createdAt: lobby.createdAt,
        state: state,
        dmMailboxId: lobby.dmMailboxId || null,
      };

      // Restore key vault
      this._keyVault = {
        current: keyVault?.current
          ? {
              key: this._hexToUint8(keyVault.current.key),
              version: keyVault.current.version,
            }
          : null,
        previous: keyVault?.previous
          ? {
              key: this._hexToUint8(keyVault.previous.key),
              version: keyVault.previous.version,
            }
          : null,
      };

      // Restore host DM mailbox ID (for members)
      this._hostDmMailboxId = hostDmMailboxId || null;

      // Set state
      this.state = state;

      // Re-subscribe to all prefixes
      if (Array.isArray(subscribedPrefixes) && subscribedPrefixes.length > 0) {
        await this._resubscribePrefixes(subscribedPrefixes);
      }

      // Restart key rotation timer if host
      if (state === LOBBY_STATES.HOSTING) {
        this._startKeyRotation();
      }

      console.info("KKTP Lobby: restoreLobbyState complete", {
        state: this.state,
        lobbyId: this.lobby.lobbyId?.slice(0, 16),
        memberCount: this.lobby.members.size,
        prefixCount: this._subscribedPrefixes.size,
        isHost: state === LOBBY_STATES.HOSTING,
      });

      // Emit state change event
      if (this._onStateChange) {
        this._onStateChange(state, LOBBY_STATES.IDLE);
      }

      return true;
    } catch (err) {
      console.error("KKTP Lobby: restoreLobbyState failed", err?.message || err);
      return false;
    }
  }

  /**
   * Re-subscribe to all prefixes after restoration.
   * @private
   * @param {string[]} prefixes - Array of KKTP prefixes to subscribe to
   */
  async _resubscribePrefixes(prefixes) {
    if (!this.sm?.adapter) {
      console.warn("KKTP Lobby: No adapter available for prefix resubscription");
      return;
    }

    for (const prefix of prefixes) {
      try {
        await this.sm.adapter.subscribeToPrefix(prefix);
        this._subscribedPrefixes.add(prefix);
      } catch (err) {
        console.warn(
          `KKTP Lobby: Failed to resubscribe to prefix ${prefix?.slice(0, 16)}...`,
          err?.message || err
        );
      }
    }

    console.info("KKTP Lobby: Resubscribed to prefixes", {
      count: this._subscribedPrefixes.size,
    });
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

  // ─────────────────────────────────────────────────────────────
  // DM Session End - Clean session_end broadcast for 1:1 sessions
  // ─────────────────────────────────────────────────────────────

  /**
   * End a 1:1 DM session cleanly by broadcasting session_end anchor.
   * This is the FINAL step when leaving/closing a lobby or being kicked.
   *
   * The session_end anchor is broadcast to the ledger so the peer can
   * observe the session termination and clean up their local state.
   *
   * @private
   * @param {string} dmMailboxId - The DM mailbox ID for the 1:1 session
   * @param {string} [reason="lobby_closed"] - Reason for ending the session
   * @returns {Promise<boolean>} True if session_end was broadcast, false otherwise
   */
  async _endDMSession(dmMailboxId, reason = "lobby_closed") {
    if (!dmMailboxId) {
      console.debug("KKTP Lobby: _endDMSession - no dmMailboxId provided");
      return false;
    }

    console.info("KKTP Lobby: Ending DM session", {
      dmMailboxId: dmMailboxId.slice(0, 16),
      reason,
    });

    try {
      // Step 1: Get the session from the vault
      const session = this.sm.getSession(dmMailboxId);
      if (!session) {
        console.info("KKTP Lobby: DM session not found, already closed", {
          dmMailboxId: dmMailboxId.slice(0, 16),
        });
        // Still unsubscribe from the mailbox prefix
        this.unsubscribeFromDMMailbox(dmMailboxId);
        return false;
      }

      // Step 2: Create session_end anchor
      if (!session.protocol?.createEndAnchor) {
        console.warn("KKTP Lobby: Session protocol unavailable for session_end", {
          dmMailboxId: dmMailboxId.slice(0, 16),
        });
        // Force close locally without broadcasting
        this.sm.closeSession(dmMailboxId);
        this.unsubscribeFromDMMailbox(dmMailboxId);
        return false;
      }

      const endAnchor = await session.protocol.createEndAnchor(reason);
      const payload = buildAnchorPayload(endAnchor);

      // Step 3: Broadcast the session_end to the ledger
      const address = await this.sm.adapter.getAddress();
      if (!address) {
        console.error("KKTP Lobby: No wallet address for session_end broadcast");
        this.sm.closeSession(dmMailboxId);
        this.unsubscribeFromDMMailbox(dmMailboxId);
        return false;
      }

      await this.sm.adapter.send({
        toAddress: address,
        amount: "1",
        payload,
      });

      console.info("KKTP Lobby: Session_end broadcast successful", {
        dmMailboxId: dmMailboxId.slice(0, 16),
        reason,
      });

      // Step 4: Close the session locally (if not already closed by createEndAnchor)
      // Note: createEndAnchor calls sm.terminate() which may already close it
      if (this.sm.getSession(dmMailboxId)) {
        this.sm.closeSession(dmMailboxId);
      }

      // Step 5: Unsubscribe from the DM mailbox
      this.unsubscribeFromDMMailbox(dmMailboxId);

      return true;
    } catch (err) {
      console.error("KKTP Lobby: Failed to end DM session", {
        dmMailboxId: dmMailboxId.slice(0, 16),
        reason,
        error: err.message,
      });

      // Best-effort cleanup even on failure
      try {
        this.sm.closeSession(dmMailboxId);
      } catch { /* ignore */ }
      this.unsubscribeFromDMMailbox(dmMailboxId);

      return false;
    }
  }

  /**
   * End all DM sessions with lobby members.
   * Used by the host when closing the lobby.
   *
   * @private
   * @param {string} reason - Reason for ending sessions
   * @returns {Promise<void>}
   */
  async _endAllMemberDMSessions(reason = "lobby_closed") {
    if (!this.lobby?.members) {
      console.debug("KKTP Lobby: No members to end DM sessions with");
      return;
    }

    const memberIds = Array.from(this.lobby.members.values())
      .filter(m => m.dmMailboxId)
      .map(m => ({ memberId: m.memberId, dmMailboxId: m.dmMailboxId }));

    if (memberIds.length === 0) {
      console.debug("KKTP Lobby: No DM sessions to end");
      return;
    }

    console.info("KKTP Lobby: Ending all member DM sessions", {
      count: memberIds.length,
      reason,
    });

    // End sessions sequentially with UTXO refresh between each
    for (const { memberId, dmMailboxId } of memberIds) {
      try {
        await this._endDMSession(dmMailboxId, reason);
        // Wait for UTXO refresh between session ends
        if (memberIds.indexOf({ memberId, dmMailboxId }) < memberIds.length - 1) {
          await this._waitForUtxoRefresh(1000, 2000);
        }
      } catch (err) {
        console.warn("KKTP Lobby: Failed to end DM session with member", {
          memberId,
          dmMailboxId: dmMailboxId?.slice(0, 16),
          error: err.message,
        });
        // Continue with next member
      }
    }

    console.info("KKTP Lobby: Finished ending all member DM sessions");
  }
}
