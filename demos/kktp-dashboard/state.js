// state.js - Dashboard state management
export const dashboardState = {
  // Identity
  myKeys: null, // { sig: { publicKey, privateKey }, dh: { publicKey, privateKey } }
  myPubSig: null,
  walletAddress: null,
  walletBalance: null,

  // Discovery
  discoveredPeers: new Map(), // sid -> discovery anchor
  broadcastedDiscovery: null, // Our current discovery anchor

  // Sessions
  activeSessionId: null, // Currently selected mailboxId
  closingSessions: new Set(),

  // Deduplication
  processedTxIds: new Set(),

  // UI State
  isConnected: false,
  isScanning: false,

  // Config
  gameName: "KKTP Chat",
  uptimeSeconds: 3600,
};

/**
 * Reset state to initial values
 */
export function resetState() {
  dashboardState.myKeys = null;
  dashboardState.myPubSig = null;
  dashboardState.walletAddress = null;
  dashboardState.walletBalance = null;
  dashboardState.discoveredPeers.clear();
  dashboardState.broadcastedDiscovery = null;
  dashboardState.activeSessionId = null;
  dashboardState.closingSessions.clear();
  dashboardState.processedTxIds.clear();
  dashboardState.isConnected = false;
  dashboardState.isScanning = false;
}

/**
 * Update connection state
 */
export function setConnected(isConnected) {
  dashboardState.isConnected = isConnected;
}

/**
 * Set active session
 */
export function setActiveSession(mailboxId) {
  dashboardState.activeSessionId = mailboxId;
}

/**
 * Add a discovered peer
 */
export function addDiscoveredPeer(
  discovery,
  { isSelf = false, discoveredAt = null } = {},
) {
  if (!discovery?.sid) return false;

  const existing = dashboardState.discoveredPeers.get(discovery.sid);
  const entry = {
    discovery,
    discoveredAt: existing?.discoveredAt ?? discoveredAt ?? Date.now(),
    isSelf,
  };

  dashboardState.discoveredPeers.set(discovery.sid, entry);
  return !existing;
}

/**
 * Remove a discovered peer
 */
export function removeDiscoveredPeer(sid) {
  dashboardState.discoveredPeers.delete(sid);
}

/**
 * Remove discovered peers by public signing key
 */
export function removeDiscoveredPeerByPubSig(pubSig) {
  if (!pubSig) return;
  for (const [sid, entry] of dashboardState.discoveredPeers.entries()) {
    if (entry?.discovery?.pub_sig === pubSig) {
      dashboardState.discoveredPeers.delete(sid);
    }
  }
}

/**
 * Get all discovered peers
 */
export function getDiscoveredPeers() {
  return Array.from(dashboardState.discoveredPeers.values()).filter(
    (p) => p?.discovery?.pub_sig,
  );
}
