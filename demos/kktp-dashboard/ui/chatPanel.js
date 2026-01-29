// chatPanel.js - Chat message rendering and controls
import { elements } from "../dom.js";
import { dashboardState } from "../state.js";
import { escapeHtml } from "./helpers.js";

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
 * Render lobby chat messages
 */
export function renderLobbyChatMessages(messages, myPubSig) {
  const container = elements.chatMessages;
  const header = elements.chatHeader;
  if (!container) return;

  if (!dashboardState.activeLobby) {
    container.innerHTML =
      '<div class="text-secondary text-center">Not in a lobby</div>';
    if (header) header.textContent = "No Lobby";
    return;
  }

  if (header) {
    header.textContent = `Lobby: ${escapeHtml(dashboardState.activeLobby.lobbyName)}`;
  }

  container.innerHTML = "";

  if (!messages || messages.length === 0) {
    container.innerHTML =
      '<div class="text-secondary text-center">No messages yet. Say hello!</div>';
    return;
  }

  for (const msg of messages) {
    const msgEl = document.createElement("div");
    const isOutbound = msg.senderPubSig === myPubSig;
    msgEl.className = `message ${isOutbound ? "outbound" : "inbound"}`;

    const time = new Date(msg.timestamp).toLocaleTimeString();
    const senderName = msg.senderName || `${msg.senderPubSig.substring(0, 8)}...`;

    msgEl.innerHTML = `
      ${!isOutbound ? `<div class="message-sender small text-accent">${escapeHtml(senderName)}</div>` : ""}
      <div class="message-content">${escapeHtml(msg.plaintext)}</div>
      <div class="message-meta">
        <span class="message-time">${time}</span>
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
