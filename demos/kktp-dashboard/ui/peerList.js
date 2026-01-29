// peerList.js - Peer discovery list rendering
import { elements } from "../dom.js";
import { dashboardState, getDiscoveredPeers } from "../state.js";
import { getExpectedEndMs } from "../../../kktp/smHelpers.js";
import { isLobbyDiscovery } from "../../../kktp/lobby/lobbySchemas.js";
import { logger } from "../logger.js";
import { escapeHtml, formatTimeAgo } from "./helpers.js";

/**
 * Render the peer discovery list (excludes lobbies)
 */
export function renderPeerList(onConnect) {
  const list = elements.peerList;
  const countEl = elements.peerCount;
  if (!list) {
    logger.warn("KKTP: peerList element not found");
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
      logger.debug("KKTP: purging expired discovery", {
        sid: discovery.sid?.slice(0, 8),
        expectedEndMs,
        now,
      });
      if (discovery.sid) {
        dashboardState.discoveredPeers.delete(discovery.sid);
      }
      return false;
    }
    return true;
  });

  // Filter out lobbies - they go in the dedicated lobby section
  const peers = allPeers.filter((p) => !isLobbyDiscovery(p.discovery));

  logger.debug("KKTP: renderPeerList", {
    totalPeers: allPeers.length,
    nonLobbyPeers: peers.length,
  });

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
      logger.warn("KKTP: skipping peer with missing pub_sig", peer);
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
        <span class="small text-secondary">${escapeHtml(gameInfo)}</span>
        <span class="small text-secondary">${timeAgo}</span>
      </div>
      ${isSelf ? '<span class="badge bg-secondary">You</span>' : `<button class="btn btn-primary btn-sm" data-sid="${discovery.sid}">Connect</button>`}
    `;

    if (!isSelf) {
      const btn = item.querySelector("button");
      btn.addEventListener("click", () => onConnect(discovery));
    }

    list.appendChild(item);
  }
}
