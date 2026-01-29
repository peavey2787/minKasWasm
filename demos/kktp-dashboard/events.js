// events.js - Protocol event routing and state updates
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
import {
  dashboardState,
  addDiscoveredPeer,
  removeDiscoveredPeer,
  removeDiscoveredPeerByPubSig,
} from "./state.js";
import {
  logEvent,
  renderPeerList,
  renderChatMessages,
  setChatEnabled,
  setMissedStatus,
} from "./ui.js";
import { decodeHexPayload } from "./sync.js";
import { setStoredDiscoveryBlockHash } from "./storage.js";
import { getExpectedEndMs } from "../../kktp/smHelpers.js";

const KKTP_PREFIX = "KKTP:";

function getMatchBlockHash(matchObj) {
  return (
    matchObj?.blockHash ||
    matchObj?.block?.hash ||
    matchObj?.tx?.blockHash ||
    ""
  );
}

function getMatchTxId(matchObj) {
  return (
    matchObj?.txid ||
    matchObj?.tx?.txid ||
    matchObj?.txId ||
    matchObj?.tx?.verboseData?.transactionId ||
    ""
  );
}

function getMatchTimestamp(matchObj) {
  return (
    matchObj?.block?.timestamp ||
    matchObj?.blockTimestamp ||
    matchObj?.tx?.timestamp ||
    matchObj?.tx?.verboseData?.timestamp ||
    null
  );
}

export function maybeStoreOwnDiscoveryBlock(event, matchObj) {
  if (event?.type !== "discovery") return;
  if (!event.anchor?.pub_sig) return;
  if (
    dashboardState.myPubSig &&
    event.anchor.pub_sig !== dashboardState.myPubSig
  )
    return;

  const blockHash = getMatchBlockHash(matchObj);
  if (!blockHash) return;

  setStoredDiscoveryBlockHash(blockHash);
  setMissedStatus(`Last discovery seen @ ${blockHash.slice(0, 8)}...`);
}

export async function handleIncomingMatch(matchObjOrArray, deps = {}) {
  const matches = Array.isArray(matchObjOrArray)
    ? matchObjOrArray
    : [matchObjOrArray];

  for (const matchObj of matches) {
    console.log("Incoming match:", matchObj);
    const txId = getMatchTxId(matchObj);
    if (txId) {
      if (dashboardState.processedTxIds.has(txId)) continue;
      dashboardState.processedTxIds.add(txId);
    }

    const payload =
      matchObj?.decodedPayload ||
      decodeHexPayload(matchObj?.payload || matchObj?.tx?.payload || "");
    if (!payload || !payload.startsWith(KKTP_PREFIX)) continue;

    try {
      const event = await kaspaPortal.processIncomingPayload(payload);
      if (event) {
        event._receivedAt = getMatchTimestamp(matchObj) || Date.now();
        handleIncomingEvent(event, deps);
        maybeStoreOwnDiscoveryBlock(event, matchObj);
        deps.scheduleSessionSave?.();
      }
    } catch (err) {
      logEvent(`Error processing payload: ${err.message}`, "error");
    }
  }
}

export function handleIncomingEvent(event, deps = {}) {
  switch (event.type) {
    case "discovery":
      if (!event.anchor || !event.anchor.pub_sig) {
        logEvent(
          "Received invalid discovery anchor (missing pub_sig)",
          "error",
        );
        return;
      }
      handleDiscoveryAnchor(event.anchor, deps, event._receivedAt);
      break;
    case "session_established":
      logEvent(
        `Session established: ${event.mailboxId.substring(0, 8)}...`,
        "success",
      );
      if (event.response?.sid) {
        removeDiscoveredPeer(event.response.sid);
      }
      renderPeerList(deps.handleConnectToPeer);
      deps.refreshSessionList?.();
      if (!dashboardState.activeSessionId) {
        deps.selectSession?.(event.mailboxId);
      }
      break;
    case "messages":
      if (event.messages?.length > 0) {
        logEvent(`Received ${event.messages.length} message(s)`, "info");
      }
      if (event.mailboxId === dashboardState.activeSessionId) {
        const session = deps.getSession?.(event.mailboxId);
        renderChatMessages(session || null);
      }
      deps.refreshSessionList?.();
      break;
    case "session_end":
      logEvent(`Session ended: ${event.reason}`, "info");
      if (event.sid) {
        removeDiscoveredPeer(event.sid);
      }
      if (event.pub_sig) {
        removeDiscoveredPeerByPubSig(event.pub_sig);
      }
      if (event.mailboxId) {
        dashboardState.closingSessions?.delete(event.mailboxId);
      }
      if (
        event.mailboxId &&
        event.mailboxId === dashboardState.activeSessionId
      ) {
        dashboardState.activeSessionId = null;
        setChatEnabled(false);
        renderChatMessages(null);
      }
      renderPeerList(deps.handleConnectToPeer);
      deps.refreshSessionList?.();
      break;
    case "response":
      logEvent("Received response anchor", "info");
      break;
    default:
      break;
  }

  deps.scheduleSessionSave?.();
}

export function handleDiscoveryAnchor(discovery, deps = {}, discoveredAt = null) {
  if (!discovery || !discovery.pub_sig) {
    logEvent("Malformed discovery anchor dropped", "error");
    return;
  }

  const now = Date.now();
  console.log("KKTP: discovery anchor received", {
    sid: discovery.sid,
    pub_sig: discovery.pub_sig,
    meta: discovery.meta || discovery.metadata || {},
    timestamp: discovery.timestamp || discovery.time || null,
    discoveredAt,
    now,
  });

  const expectedEndMs = getExpectedEndMs(
    discovery,
    discovery?.timestamp || discovery?.time || discoveredAt || now,
  );
  console.log("KKTP: discovery expiry computed", {
    sid: discovery.sid,
    expectedEndMs,
    now,
    isExpired: expectedEndMs ? now > expectedEndMs : null,
  });
  if (expectedEndMs && now > expectedEndMs) {
    console.log("KKTP: discovery anchor expired", {
      sid: discovery.sid,
      expectedEndMs,
      now,
    });
    logEvent("Expired discovery anchor dropped", "info");
    return;
  }

  const isSelf =
    dashboardState.myPubSig && discovery.pub_sig === dashboardState.myPubSig;

  if (addDiscoveredPeer(discovery, { isSelf, discoveredAt })) {
    const prefix = isSelf ? "(SELF) " : "";
    logEvent(
      `${prefix}Discovered peer: ${discovery.pub_sig.substring(0, 8)}...`,
      "info",
    );
    renderPeerList(deps.handleConnectToPeer);
  }
}
