// lobbyControls.js - Lobby UI controls and member list
import { elements } from "../dom.js";
import { escapeHtml } from "./helpers.js";

/**
 * Render lobby member list
 */
export function renderLobbyMembers(members, isHost) {
  const list = elements.lobbyMemberList;
  if (!list) return;

  list.innerHTML = "";

  if (!members || members.length === 0) {
    list.innerHTML = '<div class="list-group-item text-secondary">No members</div>';
    return;
  }

  for (const member of members) {
    const item = document.createElement("div");
    item.className = "list-group-item d-flex justify-content-between align-items-center";

    const roleIcon = member.role === "host" ? "👑" : "👤";
    const pubSigShort = `${member.pubSig.substring(0, 8)}...`;

    item.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <span>${roleIcon}</span>
        <div class="d-flex flex-column">
          <span class="fw-semibold">${escapeHtml(member.displayName)}</span>
          <span class="small text-secondary" title="${member.pubSig}">${pubSigShort}</span>
        </div>
      </div>
      ${isHost && member.role !== "host" ? `<button class="btn btn-danger btn-sm btn-kick" data-pubsig="${member.pubSig}">Kick</button>` : ""}
    `;

    list.appendChild(item);
  }
}

/**
 * Update lobby status display
 */
export function updateLobbyStatus(lobbyInfo) {
  const el = elements.lobbyStatus;
  if (!el) return;

  if (!lobbyInfo) {
    el.innerHTML = '<span class="text-secondary">Not in a lobby</span>';
    return;
  }

  const roleText = lobbyInfo.isHost ? "Hosting" : "Member";
  el.innerHTML = `
    <div class="d-flex flex-column">
      <span class="fw-semibold text-warning">${escapeHtml(lobbyInfo.lobbyName)}</span>
      <span class="small text-secondary">${roleText} • ${lobbyInfo.memberCount}/${lobbyInfo.maxMembers} members</span>
      <span class="small text-secondary">Key v${lobbyInfo.keyVersion}</span>
    </div>
  `;
}

/**
 * Toggle lobby mode checkbox state
 */
export function setLobbyModeChecked(checked) {
  const checkbox = elements.lobbyModeCheckbox;
  if (checkbox) checkbox.checked = checked;
}

/**
 * Get lobby name input value
 */
export function getLobbyNameInput() {
  return elements.lobbyNameInput?.value?.trim() || "";
}

/**
 * Set lobby name input value
 */
export function setLobbyNameInput(value) {
  const input = elements.lobbyNameInput;
  if (input) input.value = value;
}

/**
 * Show/hide lobby controls based on state
 */
export function updateLobbyControlsVisibility(inLobby, isHost) {
  const lobbyControls = elements.lobbyControls;
  const lobbyMemberSection = elements.lobbyMemberSection;
  const btnLeaveLobby = elements.btnLeaveLobby;
  const btnCloseLobby = elements.btnCloseLobby;

  if (lobbyControls) {
    lobbyControls.style.display = inLobby ? "none" : "block";
  }

  if (lobbyMemberSection) {
    lobbyMemberSection.style.display = inLobby ? "block" : "none";
  }

  if (btnLeaveLobby) {
    btnLeaveLobby.style.display = inLobby && !isHost ? "inline-block" : "none";
  }

  if (btnCloseLobby) {
    btnCloseLobby.style.display = inLobby && isHost ? "inline-block" : "none";
  }
}
