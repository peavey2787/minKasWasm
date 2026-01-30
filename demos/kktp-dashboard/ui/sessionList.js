// sessionList.js - Session list rendering
import { elements } from "../dom.js";
import { dashboardState } from "../state.js";

/**
 * Render the session list with separate sections for lobby and 1:1 sessions
 * @param {Array} sessions - All 1:1 sessions from kaspaPortal
 * @param {string|null} activeId - Currently active 1:1 session mailboxId
 * @param {Function} onSelect - Callback for selecting a 1:1 session
 * @param {Object} [lobbyCallbacks] - { onSelectLobby: Function, lobbyManager: LobbyManager }
 */
export function renderSessionList(sessions, activeId, onSelect, lobbyCallbacks = {}) {
  const list = elements.sessionList;
  const countEl = elements.sessionCount;
  if (!list) return;

  const { onSelectLobby, lobbyManager } = lobbyCallbacks;
  const activeLobby = dashboardState.activeLobby;
  const isLobbyActive = dashboardState.isLobbyMode && activeLobby;

  // Count includes lobby if active
  const totalCount = sessions.length + (isLobbyActive ? 1 : 0);
  if (countEl) {
    countEl.textContent = totalCount;
  }

  list.innerHTML = "";

  // Render active lobby session first (if in a lobby)
  if (isLobbyActive && lobbyManager) {
    const lobbyHeader = document.createElement("div");
    lobbyHeader.className = "list-group-item bg-dark text-warning small fw-semibold";
    lobbyHeader.textContent = "🏠 Lobby Session";
    list.appendChild(lobbyHeader);

    const lobbyItem = document.createElement("div");
    const isLobbySelected = dashboardState.activeLobbySelected === true;
    lobbyItem.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isLobbySelected ? "active" : ""}`;
    lobbyItem.dataset.lobbyId = activeLobby.lobbyId;

    const memberCount = lobbyManager.members?.length || 1;
    const roleText = activeLobby.isHost ? "Host" : "Member";
    const lobbyName = activeLobby.lobbyName || "Unnamed Lobby";

    lobbyItem.innerHTML = `
      <div class="d-flex flex-column">
        <span class="fw-semibold">${escapeHtml(lobbyName)}</span>
        <span class="small text-secondary">${roleText} • ${memberCount} members</span>
      </div>
      <span class="badge rounded-pill text-bg-warning">GROUP</span>
    `;

    lobbyItem.addEventListener("click", () => {
      if (typeof onSelectLobby === "function") {
        onSelectLobby();
      }
    });
    list.appendChild(lobbyItem);
  }

  // Render 1:1 sessions section
  if (sessions.length > 0) {
    const dmHeader = document.createElement("div");
    dmHeader.className = "list-group-item bg-dark text-info small fw-semibold";
    dmHeader.textContent = "💬 1:1 Sessions";
    list.appendChild(dmHeader);

    for (const session of sessions) {
      const item = document.createElement("div");
      const isActive = session.mailboxId === activeId && !dashboardState.activeLobbySelected;
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
  } else if (!isLobbyActive) {
    list.innerHTML = '<div class="list-group-item text-secondary">No active sessions</div>';
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (text == null) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}
