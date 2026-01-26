// state.js - Dashboard state management
export const dashboardState = {
  // Identity
  myKeys: null, // { sig: { publicKey, privateKey }, dh: { publicKey, privateKey } }
  myPubSig: null,

  // Discovery
  discoveredPeers: new Map(), // sid -> discovery anchor
  broadcastedDiscovery: null, // Our current discovery anchor

  // Sessions
  activeSessionId: null, // Currently selected mailboxId

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
  dashboardState.discoveredPeers.clear();
  dashboardState.broadcastedDiscovery = null;
  dashboardState.activeSessionId = null;
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
export function addDiscoveredPeer(discovery) {
  // Don't add our own discovery
  if (dashboardState.myPubSig && discovery.pub_sig === dashboardState.myPubSig) {
    return false;
  }

  // Don't add duplicates
  if (dashboardState.discoveredPeers.has(discovery.sid)) {
    return false;
  }

  dashboardState.discoveredPeers.set(discovery.sid, {
    discovery,
    discoveredAt: Date.now(),
  });

  return true;
}

/**
 * Remove a discovered peer
 */
export function removeDiscoveredPeer(sid) {
  dashboardState.discoveredPeers.delete(sid);
}

/**
 * Get all discovered peers
 */
export function getDiscoveredPeers() {
  return Array.from(dashboardState.discoveredPeers.values());
}
