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
    el.className = "badge rounded-pill text-bg-success";
  } else {
    el.textContent = "Disconnected";
    el.className = "badge rounded-pill text-bg-danger";
  }
}

/**
 * Update scanner status display
 */
export function updateScannerStatus(state) {
  const el = elements.scannerStatus;
  if (!el) return;

  if (typeof state === "boolean") {
    state = state ? "ready" : "idle";
  }

  if (state === "syncing") {
    el.textContent = "Syncing";
    el.className = "badge rounded-pill text-bg-warning";
    return;
  }

  if (state === "ready") {
    el.textContent = "Ready";
    el.className = "badge rounded-pill text-bg-success";
    return;
  }

  el.textContent = "Idle";
  el.className = "badge rounded-pill text-bg-secondary";
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
    el.className = "small text-accent";
  } else {
    el.className = "small text-secondary";
    el.innerHTML =
      'Fund your wallet via the <a href="https://faucet-tn10.kaspanet.io/" target="_blank" rel="noopener">Testnet-10 faucet</a> — copy the address below and send test KAS.';
  }
}

/**
 * Update wallet address display (truncated)
 */
export function updateWalletAddress(address) {
  const el = elements.walletAddress;
  const btn = elements.btnCopyAddress;
  if (!el) return;

  if (address) {
    el.textContent = `Address: ${truncateAddress(address)}`;
    el.title = address;
    el.classList.remove("wallet-address-wrap");
    if (btn) btn.disabled = false;
  } else {
    el.textContent = "Address: —";
    el.title = "";
    el.classList.remove("wallet-address-wrap");
    if (btn) btn.disabled = true;
  }
}

/**
 * Show the full wallet address (wrapped) for manual copy.
 */
export function showFullWalletAddress(address) {
  const el = elements.walletAddress;
  if (!el) return;
  if (!address) {
    el.textContent = "Address: —";
    el.title = "";
    el.classList.remove("wallet-address-wrap");
    return;
  }
  el.textContent = `Address: ${address}`;
  el.title = address;
  el.classList.add("wallet-address-wrap");
}

/**
 * Update wallet balance display
 */
export function updateWalletBalance(balanceText) {
  const el = elements.walletBalance;
  if (!el) return;

  if (balanceText) {
    el.textContent = `Balance: ${balanceText} KAS`;
  } else {
    el.textContent = "Balance: —";
  }
}

/**
 * Update copy button feedback
 */
export function setCopyStatus(text, isDisabled = false) {
  const btn = elements.btnCopyAddress;
  if (!btn) return;
  btn.textContent = text;
  btn.disabled = isDisabled;
}

/**
 * Update broadcast status
 */
export function updateBroadcastStatus(status, type = "info") {
  const el = elements.broadcastStatus;
  if (!el) return;

  el.textContent = status;
  el.className = "small text-center";
  if (type === "success") el.classList.add("text-success");
  else if (type === "error") el.classList.add("text-danger");
  else if (type === "pending") el.classList.add("text-warning");
  else el.classList.add("text-secondary");
}

/**
 * Update missed-scan status
 */
export function setMissedStatus(text) {
  const el = elements.missedStatus;
  if (!el) return;
  el.textContent = text || "";
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
    list.innerHTML =
      '<div class="list-group-item text-secondary">No peers discovered yet...</div>';
    return;
  }

  for (const peer of peers) {
    if (!peer?.discovery?.pub_sig) {
      console.warn("Skipping peer with missing pub_sig", peer);
      continue;
    }
    const { discovery, discoveredAt, isSelf } = peer;
    const labelPrefix = isSelf ? "(SELF) " : "";
    const pubSigShort = `${labelPrefix}${discovery.pub_sig.substring(0, 8)}...`;
    const gameInfo = discovery.meta?.game || "Unknown";
    const timeAgo = formatTimeAgo(discoveredAt);

    const item = document.createElement("div");
    item.className = "list-group-item d-flex justify-content-between align-items-center";

    item.innerHTML = `
      <div class="d-flex flex-column">
        <span class="fw-semibold text-accent" title="${discovery.pub_sig}">${pubSigShort}</span>
        <span class="small text-secondary">${gameInfo}</span>
        <span class="small text-secondary">${timeAgo}</span>
      </div>
      <button class="btn btn-primary btn-sm" data-sid="${discovery.sid}">Connect</button>
    `;

    const btn = item.querySelector("button");
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
    list.innerHTML = '<div class="list-group-item text-secondary">No active sessions</div>';
    return;
  }

  for (const session of sessions) {
    const item = document.createElement("div");
    const isActive = session.mailboxId === activeId;
    item.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isActive ? "active" : ""}`;
    item.dataset.mailboxId = session.mailboxId;

    const peerSig = session.peerPubSig || "unknown";
    const peerShort = `${peerSig.substring(0, 8)}...`;
    const unread = (session.messages || []).filter(
      (m) => !m.isOutbound && !m.read,
    ).length;
    const role = session.isInitiator ? "I" : "R";
    const state = session?.sm?.state || "active";

    const statusClass =
      state.toLowerCase() === "active"
        ? "text-bg-success"
        : state.toLowerCase() === "faulted"
          ? "text-bg-danger"
          : "text-bg-secondary";

    item.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <span class="fw-semibold" title="${peerSig}">${peerShort}</span>
        <span class="small text-secondary">[${role}]</span>
        ${unread > 0 ? `<span class="badge rounded-pill text-bg-info">${unread}</span>` : ""}
      </div>
      <span class="badge rounded-pill ${statusClass}">${state}</span>
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
    container.innerHTML =
      '<div class="text-secondary text-center">Select a session to view messages</div>';
    if (header) header.textContent = "No Session Selected";
    return;
  }

  if (header) {
    const peerShort = `${session.peerPubSig.substring(0, 12)}...`;
    header.textContent = `Chat with ${peerShort}`;
  }

  container.innerHTML = "";

  if (session.messages.length === 0) {
    container.innerHTML =
      '<div class="text-secondary text-center">No messages yet. Say hello!</div>';
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

function truncateAddress(address) {
  if (!address) return "";

  // Force it to a string so .slice exists
  const addrStr = address.toString();

  if (addrStr.length <= 16) return addrStr;
  return `${addrStr.slice(0, 8)}...${addrStr.slice(-6)}`;
}
