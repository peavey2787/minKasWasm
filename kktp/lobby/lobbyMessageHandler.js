/**
 * LobbyMessageHandler - Routes incoming messages to appropriate lobby handlers
 *
 * Responsible for:
 * - Parsing incoming lobby-related messages
 * - Routing to appropriate LobbyManager methods
 * - Handling both 1:1 DM messages and group messages
 *
 * @module kktp/lobby/lobbyMessageHandler
 */

const LOBBY_MESSAGE_TYPES = {
  JOIN_REQUEST: "lobby_join_request",
  JOIN_RESPONSE: "lobby_join_response",
  MEMBER_EVENT: "lobby_member_event",
  KEY_ROTATION: "key_rotation",
  LOBBY_LEAVE: "lobby_leave",
  LOBBY_KICKED: "lobby_kicked",
  LOBBY_CLOSE: "lobby_close",
  GROUP_MESSAGE: "group_message",
};

export class LobbyMessageHandler {
  /**
   * @param {import('./lobbyManager.js').LobbyManager} lobbyManager
   */
  constructor(lobbyManager) {
    this.lobbyManager = lobbyManager;
  }

  /**
   * Process an incoming DM message that may be lobby-related
   * @param {string} dmMailboxId - The DM mailbox ID
   * @param {string} plaintextJson - The decrypted message content
   * @returns {boolean} - True if message was handled as lobby message
   */
  processDMMessage(dmMailboxId, plaintextJson) {
    let msg;
    try {
      msg = JSON.parse(plaintextJson);
    } catch {
      // Not JSON, not a lobby message
      return false;
    }

    if (!msg || typeof msg.type !== "string") {
      return false;
    }

    // Route based on message type
    switch (msg.type) {
      case LOBBY_MESSAGE_TYPES.JOIN_REQUEST:
        this._handleJoinRequest(dmMailboxId, msg);
        return true;

      case LOBBY_MESSAGE_TYPES.JOIN_RESPONSE:
        this._handleJoinResponse(dmMailboxId, msg);
        return true;

      case LOBBY_MESSAGE_TYPES.MEMBER_EVENT:
        this._handleMemberEvent(msg);
        return true;

      case LOBBY_MESSAGE_TYPES.KEY_ROTATION:
        this._handleKeyRotation(msg);
        return true;

      case LOBBY_MESSAGE_TYPES.LOBBY_LEAVE:
        this._handleMemberLeave(dmMailboxId, msg);
        return true;

      case LOBBY_MESSAGE_TYPES.LOBBY_KICKED:
        this._handleKicked(msg);
        return true;

      case LOBBY_MESSAGE_TYPES.LOBBY_CLOSE:
        this._handleLobbyClose(msg);
        return true;

      default:
        return false;
    }
  }

  /**
   * Process an incoming group message from the DAG
   * @param {string} groupMailboxId - The group mailbox ID
   * @param {Object} encrypted - The encrypted group message object
   * @returns {boolean} - True if message was handled
   */
  async processGroupMessage(groupMailboxId, encrypted) {
    // Verify this is for our lobby
    if (!this.lobbyManager.lobby) {
      return false;
    }

    if (groupMailboxId !== this.lobbyManager.lobby.groupMailboxId) {
      return false;
    }

    await this.lobbyManager.processGroupMessage(encrypted);
    return true;
  }

  /**
   * Check if a raw payload is a group message for our lobby
   * @param {string} rawPayload - Raw KKTP payload
   * @returns {{ isGroup: boolean, groupMailboxId?: string, encrypted?: Object }}
   */
  parseGroupPayload(rawPayload) {
    if (!rawPayload.startsWith("KKTP:GROUP:")) {
      return { isGroup: false };
    }

    // Format: KKTP:GROUP:{groupMailboxId}:{json}
    const parts = rawPayload.split(":");
    if (parts.length < 4) {
      return { isGroup: false };
    }

    const groupMailboxId = parts[2];
    const jsonStr = parts.slice(3).join(":");

    try {
      const encrypted = JSON.parse(jsonStr);
      return { isGroup: true, groupMailboxId, encrypted };
    } catch {
      return { isGroup: false };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private Handlers
  // ─────────────────────────────────────────────────────────────

  async _handleJoinRequest(dmMailboxId, msg) {
    try {
      await this.lobbyManager.handleJoinRequest(dmMailboxId, msg);
    } catch (err) {
      console.error("LobbyMessageHandler: Failed to handle join request", err);
    }
  }

  async _handleJoinResponse(dmMailboxId, msg) {
    try {
      await this.lobbyManager.handleJoinResponse(dmMailboxId, msg);
    } catch (err) {
      console.error("LobbyMessageHandler: Failed to handle join response", err);
    }
  }

  _handleMemberEvent(msg) {
    try {
      this.lobbyManager.handleMemberEvent(msg);
    } catch (err) {
      console.error("LobbyMessageHandler: Failed to handle member event", err);
    }
  }

  _handleKeyRotation(msg) {
    try {
      this.lobbyManager.handleKeyRotation(msg);
    } catch (err) {
      console.error("LobbyMessageHandler: Failed to handle key rotation", err);
    }
  }

  async _handleMemberLeave(dmMailboxId, msg) {
    // Host receives this when a member leaves voluntarily
    if (!this.lobbyManager.isHost) return;

    const { pubSig, reason } = msg;
    if (!pubSig) return;

    const member = this.lobbyManager.lobby?.members.get(pubSig);
    if (!member) return;

    // Remove from roster
    this.lobbyManager.lobby.members.delete(pubSig);

    // Notify other members
    try {
      await this.lobbyManager._broadcastMemberEvent("leave", { pubSig, reason });
    } catch (err) {
      console.warn("LobbyMessageHandler: Failed to broadcast member leave", err);
    }

    // Emit event
    this.lobbyManager._onMemberLeave?.(pubSig, reason || "Left voluntarily");

    console.info("LobbyMessageHandler: Member left", {
      pubSig: pubSig.slice(0, 16),
      reason,
    });
  }

  _handleKicked(msg) {
    try {
      this.lobbyManager.handleKicked(msg);
    } catch (err) {
      console.error("LobbyMessageHandler: Failed to handle kicked", err);
    }
  }

  _handleLobbyClose(msg) {
    try {
      this.lobbyManager.handleLobbyClose(msg);
    } catch (err) {
      console.error("LobbyMessageHandler: Failed to handle lobby close", err);
    }
  }
}

export { LOBBY_MESSAGE_TYPES };
