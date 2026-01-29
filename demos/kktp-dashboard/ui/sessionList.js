// sessionList.js - Session list rendering
import { elements } from "../dom.js";

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
