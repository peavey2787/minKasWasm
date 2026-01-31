// dom.js - DOM element references
export const $ = (id) => document.getElementById(id);

export const elements = {
  // Status
  get connectionStatus() { return $("connectionStatus"); },
  get scannerStatus() { return $("scannerStatus"); },
  get utxoStatus() { return $("utxoStatus"); },
  get identityDisplay() { return $("identityDisplay"); },

  // Identity Hub
  get gameName() { return $("gameName"); },
  get uptimeSeconds() { return $("uptimeSeconds"); },
  get btnBroadcast() { return $("btnBroadcast"); },
  get broadcastStatus() { return $("broadcastStatus"); },
  get walletAddress() { return $("walletAddress"); },
  get btnCopyAddress() { return $("btnCopyAddress"); },
  get walletBalance() { return $("walletBalance"); },
  get joinBlockHashInput() { return $("joinBlockHashInput"); },
  get btnJoinViaHash() { return $("btnJoinViaHash"); },
  get joinStatus() { return $("joinStatus"); },
  get discoveryBlockHashSection() { return $("discoveryBlockHashSection"); },
  get discoveryBlockHashDisplay() { return $("discoveryBlockHashDisplay"); },
  get btnCopyDiscoveryHash() { return $("btnCopyDiscoveryHash"); },

  // Lobby Controls
  get lobbyModeCheckbox() { return $("lobbyModeCheckbox"); },
  get lobbyNameInput() { return $("lobbyNameInput"); },
  get lobbyNameGroup() { return $("lobbyNameGroup"); },
  get lobbyControls() { return $("lobbyControls"); },
  get lobbyStatus() { return $("lobbyStatus"); },
  get lobbyMemberSection() { return $("lobbyMemberSection"); },
  get lobbyMemberList() { return $("lobbyMemberList"); },
  get btnLeaveLobby() { return $("btnLeaveLobby"); },
  get btnCloseLobby() { return $("btnCloseLobby"); },

  // Peer Discovery
  get peerList() { return $("peerList"); },
  get peerCount() { return $("peerCount"); },

  // Lobby Discovery
  get lobbyList() { return $("lobbyList"); },
  get lobbyCount() { return $("lobbyCount"); },

  // Sessions
  get sessionList() { return $("sessionList"); },
  get sessionCount() { return $("sessionCount"); },

  // Chat
  get chatHeader() { return $("chatHeader"); },
  get chatMessages() { return $("chatMessages"); },
  get messageInput() { return $("messageInput"); },
  get btnSend() { return $("btnSend"); },
  get btnCloseSession() { return $("btnCloseSession"); },

  // Logs
  get eventLog() { return $("eventLog"); },
};
