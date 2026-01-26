// ui.js - UI rendering functions
import { elements } from "./dom.js";
import { dashboardState, getDiscoveredPeers } from "./state.js";

/**
 * Log an event to the event log panel
 */
export function logEvent(message, type = "info") {
  const log = elements.eventLog;
  if (!log) return;

  const time = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry log-${type}`;
  entry.textContent = `[${time}] ${message}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

/**
 * Update connection status display
 */
export function updateConnectionStatus(isConnected, networkId = "") {
  const el = elements.connectionStatus;
  if (!el) return;

  if (isConnected) {
    el.textContent = `Connected: ${networkId}`;
    el.className = "status-badge connected";
  } else {
    el.textContent = "Disconnected";
    el.className = "status-badge disconnected";
  }
}

/**
 * Update scanner status display
 */
export function updateScannerStatus(isScanning) {
  const el = elements.scannerStatus;
  if (!el) return;

  if (isScanning) {
    el.textContent = "Scanning";
    el.className = "status-badge scanning";
  } else {
    el.textContent = "Idle";
    el.className = "status-badge idle";
  }
}

/**
 * Update identity display
 */
export function updateIdentityDisplay(pubSig) {
  const el = elements.identityDisplay;
  if (!el) return;

  if (pubSig) {
    el.textContent = `${pubSig.substring(0, 8)}...${pubSig.substring(pubSig.length - 8)}`;
    el.title = pubSig;
  } else {
    el.textContent = "Not initialized";
  }
}

/**
 * Update broadcast status
 */
export function updateBroadcastStatus(status, type = "info") {
  const el = elements.broadcastStatus;
  if (!el) return;

  el.textContent = status;
  el.className = `broadcast-status ${type}`;
}

/**
 * Render the peer discovery list
 */
export function renderPeerList(onConnect) {
  const list = elements.peerList;
  const countEl = elements.peerCount;
  if (!list) return;

  const peers = getDiscoveredPeers();

  if (countEl) {
    countEl.textContent = peers.length;
  }

  list.innerHTML = "";

  if (peers.length === 0) {
    list.innerHTML = '<div class="empty-state">No peers discovered yet...</div>';
    return;
  }

  for (const { discovery, discoveredAt } of peers) {
    const item = document.createElement("div");
    item.className = "peer-item";

    const pubSigShort = `${discovery.pub_sig.substring(0, 8)}...`;
    const gameInfo = discovery.meta?.game || "Unknown";
    const timeAgo = formatTimeAgo(discoveredAt);

    item.innerHTML = `
      <div class="peer-info">
        <span class="peer-id" title="${discovery.pub_sig}">${pubSigShort}</span>
        <span class="peer-game">${gameInfo}</span>
        <span class="peer-time">${timeAgo}</span>
      </div>
      <button class="btn-connect" data-sid="${discovery.sid}">Connect</button>
    `;

    const btn = item.querySelector(".btn-connect");
    btn.addEventListener("click", () => onConnect(discovery));

    list.appendChild(item);
  }
}

/**
 * Render the session list
 */
export function renderSessionList(sessions, activeId, onSelect) {
  const list = elements.sessionList;
  const countEl = elements.sessionCount;
  if (!list) return;

  if (countEl) {
    countEl.textContent = sessions.length;
  }

  list.innerHTML = "";

  if (sessions.length === 0) {
    list.innerHTML = '<div class="empty-state">No active sessions</div>';
    return;
  }

  for (const session of sessions) {
    const item = document.createElement("div");
    item.className = `session-item ${session.mailboxId === activeId ? "active" : ""}`;
    item.dataset.mailboxId = session.mailboxId;

    const peerShort = `${session.peerPubSig.substring(0, 8)}...`;
    const unread = session.messages.filter(m => !m.isOutbound && !m.read).length;
    const role = session.isInitiator ? "I" : "R";

    item.innerHTML = `
      <div class="session-info">
        <span class="session-peer" title="${session.peerPubSig}">${peerShort}</span>
        <span class="session-role">[${role}]</span>
        ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ""}
      </div>
      <span class="session-status ${session.stateMachine.state.toLowerCase()}">${session.stateMachine.state}</span>
    `;

    item.addEventListener("click", () => onSelect(session.mailboxId));
    list.appendChild(item);
  }
}

/**
 * Render chat messages for the active session
 */
export function renderChatMessages(session) {
  const container = elements.chatMessages;
  const header = elements.chatHeader;
  if (!container) return;

  if (!session) {
    container.innerHTML = '<div class="empty-state">Select a session to view messages</div>';
    if (header) header.textContent = "No Session Selected";
    return;
  }

  if (header) {
    const peerShort = `${session.peerPubSig.substring(0, 12)}...`;
    header.textContent = `Chat with ${peerShort}`;
  }

  container.innerHTML = "";

  if (session.messages.length === 0) {
    container.innerHTML = '<div class="empty-state">No messages yet. Say hello!</div>';
    return;
  }

  for (const msg of session.messages) {
    const msgEl = document.createElement("div");
    msgEl.className = `message ${msg.isOutbound ? "outbound" : "inbound"} ${msg.status}`;

    const time = new Date(msg.timestamp).toLocaleTimeString();

    msgEl.innerHTML = `
      <div class="message-content">${escapeHtml(msg.plaintext)}</div>
      <div class="message-meta">
        <span class="message-time">${time}</span>
        ${msg.status === "pending" ? '<span class="message-pending">⏳</span>' : ""}
      </div>
    `;

    container.appendChild(msgEl);
  }

  container.scrollTop = container.scrollHeight;
}

/**
 * Enable/disable chat controls
 */
export function setChatEnabled(enabled) {
  const input = elements.messageInput;
  const btnSend = elements.btnSend;
  const btnClose = elements.btnCloseSession;

  if (input) input.disabled = !enabled;
  if (btnSend) btnSend.disabled = !enabled;
  if (btnClose) btnClose.disabled = !enabled;
}

/**
 * Clear the message input
 */
export function clearMessageInput() {
  const input = elements.messageInput;
  if (input) input.value = "";
}

// Utility functions
function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
