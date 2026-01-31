// ui/index.js - Re-export all UI modules
export { logEvent, clearEventLog } from "./logPanel.js";
export {
  updateConnectionStatus,
  updateScannerStatus,
  updateUtxoStatus,
  updateIdentityDisplay,
  updateBroadcastStatus,
  setJoinStatus,
} from "./statusDisplay.js";
export {
  updateWalletAddress,
  showFullWalletAddress,
  updateWalletBalance,
  setCopyStatus,
} from "./walletDisplay.js";
export { renderPeerList } from "./peerList.js";
export { renderDiscoveredLobbies } from "./lobbyList.js";
export { renderSessionList } from "./sessionList.js";
export {
  renderChatMessages,
  renderLobbyChatMessages,
  setChatEnabled,
  clearMessageInput,
} from "./chatPanel.js";
export {
  renderLobbyMembers,
  updateLobbyStatus,
  setLobbyModeChecked,
  getLobbyNameInput,
  setLobbyNameInput,
  updateLobbyControlsVisibility,
} from "./lobbyControls.js";
export {
  formatTimeAgo,
  escapeHtml,
  truncateAddress,
} from "./helpers.js";
