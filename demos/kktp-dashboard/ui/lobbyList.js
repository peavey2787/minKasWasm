// lobbyList.js - Discovered lobbies list rendering
import { elements } from "../dom.js";
import { dashboardState, getDiscoveredPeers } from "../state.js";
import { getExpectedEndMs } from "../../../kktp/protocol/sessions/index.js";
import { isLobbyDiscovery, extractLobbyInfo } from "../../../kktp/lobby/lobbySchemas.js";
import { logger } from "../logger.js";
import { escapeHtml, formatTimeAgo } from "./helpers.js";

/**
 * Render the discovered lobbies list (dedicated section)
 */
export function renderDiscoveredLobbies(onJoinLobby) {
  const list = elements.lobbyList;
  const countEl = elements.lobbyCount;
  if (!list) {
    logger.warn("KKTP: lobbyList element not found");
    return;
  }

  const now = Date.now();
  const allPeers = getDiscoveredPeers().filter((peer) => {
    const discovery = peer?.discovery;
    if (!discovery) return false;
    const expectedEndMs = getExpectedEndMs(
      discovery,
      discovery?.timestamp || discovery?.time || peer?.discoveredAt,
    );
    if (expectedEndMs && now > expectedEndMs) {
      if (discovery.sid) {
        dashboardState.discoveredPeers.delete(discovery.sid);
      }
      return false;
    }
    return true;
  });

  // Filter only lobbies
  const lobbies = allPeers.filter((p) => isLobbyDiscovery(p.discovery));

  logger.debug("KKTP: renderDiscoveredLobbies", {
    totalPeers: allPeers.length,
    lobbyCount: lobbies.length,
    lobbySids: lobbies.map((p) => p?.discovery?.sid?.slice(0, 8)).filter(Boolean),
  });

  if (countEl) {
    countEl.textContent = lobbies.length;
  }

  list.innerHTML = "";

  if (lobbies.length === 0) {
    list.innerHTML =
      '<div class="list-group-item text-secondary">No lobbies discovered yet...</div>';
    return;
  }

  for (const peer of lobbies) {
    const { discovery, discoveredAt, isSelf } = peer;
    const lobbyInfo = extractLobbyInfo(discovery);
    const timeAgo = formatTimeAgo(discoveredAt);

    const item = document.createElement("div");
    item.className = "list-group-item";

    if (isSelf) {
      // Host view - no join button
      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div class="d-flex flex-column">
            <span class="fw-semibold text-warning" title="${discovery.pub_sig}">
              (YOUR LOBBY) ${escapeHtml(lobbyInfo.lobbyName)}
            </span>
            <span class="small text-secondary">${escapeHtml(lobbyInfo.game)} • Max: ${lobbyInfo.maxMembers}</span>
            <span class="small text-secondary">${timeAgo}</span>
          </div>
          <span class="badge bg-success">Hosting</span>
        </div>
      `;
    } else {
      // Non-host view - single Join button
      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div class="d-flex flex-column">
            <span class="fw-semibold text-warning" title="${discovery.pub_sig}">
              ${escapeHtml(lobbyInfo.lobbyName)}
            </span>
            <span class="small text-secondary">${escapeHtml(lobbyInfo.game)} • Max: ${lobbyInfo.maxMembers}</span>
            <span class="small text-secondary">${timeAgo}</span>
          </div>
          <button class="btn btn-warning btn-sm" data-sid="${discovery.sid}">Join</button>
        </div>
      `;

      const joinBtn = item.querySelector("button");
      if (joinBtn && typeof onJoinLobby === "function") {
        joinBtn.addEventListener("click", () => onJoinLobby(discovery));
      }
    }

    list.appendChild(item);
  }
}
