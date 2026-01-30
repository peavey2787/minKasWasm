// LobbyFacade - Single entry point for lobby operations
import { LobbyManager, LOBBY_STATES, MEMBER_ROLES } from "./lobbyManager.js";
import { LobbyMessageHandler } from "./lobbyMessageHandler.js";

/**
 * LobbyFacade
 * Provides a clean, stable API for hosting/joining lobbies,
 * routing DM/group messages, and accessing lobby state.
 */
export class LobbyFacade {
  /**
   * @param {import("../sessionManager.js").SessionManager} sessionManager
   * @param {Object} [options]
   */
  constructor(sessionManager, options = {}) {
    this._manager = new LobbyManager(sessionManager, options);
    this._handler = new LobbyMessageHandler(this._manager);
  }

  // ─────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────

  async hostLobby(options) {
    return await this._manager.hostLobby(options);
  }

  async joinLobby(lobbyDiscovery, displayName) {
    return await this._manager.joinLobby(lobbyDiscovery, displayName);
  }

  async leaveLobby(reason) {
    return await this._manager.leaveLobby(reason);
  }

  async closeLobby(reason) {
    return await this._manager.closeLobby(reason);
  }

  async sendGroupMessage(plaintext) {
    return await this._manager.sendGroupMessage(plaintext);
  }

  // ─────────────────────────────────────────────────────────────
  // Incoming message routing
  // ─────────────────────────────────────────────────────────────

  /**
   * Route a decrypted DM plaintext to the lobby handler.
   * @returns {boolean} handled
   */
  handleDMMessage(mailboxId, plaintextJson) {
    return this._handler.processDMMessage(mailboxId, plaintextJson);
  }

  /**
   * Route a raw KKTP payload to the group handler.
   * @returns {{isGroup: boolean, groupMailboxId?: string, encrypted?: Object}}
   */
  parseGroupPayload(rawPayload) {
    return this._handler.parseGroupPayload(rawPayload);
  }

  /**
   * Process an encrypted group message object.
   */
  async handleGroupMessage(groupMailboxId, encrypted) {
    return await this._handler.processGroupMessage(groupMailboxId, encrypted);
  }

  // ─────────────────────────────────────────────────────────────
  // Events (pass-through)
  // ─────────────────────────────────────────────────────────────

  onMemberJoin(cb) { this._manager.onMemberJoin(cb); }
  onMemberLeave(cb) { this._manager.onMemberLeave(cb); }
  onGroupMessage(cb) { this._manager.onGroupMessage(cb); }
  onKeyRotation(cb) { this._manager.onKeyRotation(cb); }
  onLobbyClose(cb) { this._manager.onLobbyClose(cb); }
  onStateChange(cb) { this._manager.onStateChange(cb); }
  onJoinRequest(cb) { this._manager.onJoinRequest(cb); }

  // ─────────────────────────────────────────────────────────────
  // State accessors
  // ─────────────────────────────────────────────────────────────

  get currentState() { return this._manager.currentState; }
  get lobbyInfo() { return this._manager.lobbyInfo; }
  get members() { return this._manager.members; }
  get messageHistory() { return this._manager.messageHistory; }
  get isHost() { return this._manager.isHost; }

  get pendingJoinRequests() { return this._manager.pendingJoinRequests; }

  // Expose enums for convenience
  static get STATES() { return LOBBY_STATES; }
  static get ROLES() { return MEMBER_ROLES; }
}

export { LOBBY_STATES, MEMBER_ROLES };
