/**
 * KKTP Lobby Module - Group sessions on top of KKTP
 *
 * This module provides lobby/group session functionality built on top of
 * the 1:1 KKTP protocol. It enables multi-party communication with:
 *
 * - Host-managed lobbies with discovery anchors
 * - Encrypted group messaging using XChaCha20-Poly1305
 * - Automatic key rotation every 10 minutes
 * - Member management (join, leave, kick)
 * - State root commitments for integrity
 *
 * Architecture:
 * - Host broadcasts a KKTP discovery anchor with lobby=true
 * - Peers join via private 1:1 KKTP DM with join request
 * - Host distributes GroupKey_vN via encrypted 1:1 DMs
 * - All group messages encrypted with group key and broadcast to group mailbox
 *
 * @module kktp/lobby
 */

export { LobbyManager, LOBBY_STATES, MEMBER_ROLES } from "./lobbyManager.js";
export { LobbyMessageHandler, LOBBY_MESSAGE_TYPES } from "./lobbyMessageHandler.js";
export { LobbyCodec } from "./lobbyCodec.js";
export {
  LobbyValidationError,
  validateLobbyMeta,
  validateJoinRequest,
  validateJoinResponse,
  validateGroupMessage,
  validateKeyRotation,
  validateMemberEvent,
  validateLeaveMessage,
  validateKickMessage,
  validateCloseMessage,
  isLobbyDiscovery,
  extractLobbyInfo,
} from "./lobbySchemas.js";
