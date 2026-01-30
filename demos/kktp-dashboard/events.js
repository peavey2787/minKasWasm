// events.js - Protocol event routing and state updates
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
import {
  dashboardState,
  addDiscoveredPeer,
  removeDiscoveredPeer,
  removeDiscoveredPeerByPubSig,
} from "./state.js";
import { logger } from "./logger.js";
import {
  logEvent,
  renderPeerList,
  renderDiscoveredLobbies,
  renderChatMessages,
  renderLobbyChatMessages,
  renderLobbyMembers,
  updateLobbyStatus,
  setChatEnabled,
  setMissedStatus,
} from "./ui.js";
import { decodeHexPayload } from "./sync.js";
import { setStoredDiscoveryBlockHash } from "./storage.js";
import { getExpectedEndMs } from "../../kktp/protocol/sessions/index.js";

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
    logger.debug("KKTP: incoming match", matchObj);
    const txId = getMatchTxId(matchObj);
    if (txId) {
      if (dashboardState.processedTxIds.has(txId)) continue;
      dashboardState.processedTxIds.add(txId);
    }

    const payload =
      matchObj?.decodedPayload ||
      decodeHexPayload(matchObj?.payload || matchObj?.tx?.payload || "");
    if (!payload || !payload.startsWith(KKTP_PREFIX)) continue;
    logger.debug("KKTP: matched payload", {
      txId,
      prefix: payload.slice(0, 24),
      size: payload.length,
    });

    // Check if this is a group message for our lobby
    const lobbyManager = dashboardState.lobbyManager;
    if (lobbyManager && payload.startsWith("KKTP:GROUP:")) {
      const parsed = lobbyManager.handler.parseGroupPayload(payload);
      if (parsed.isGroup && parsed.groupMailboxId && parsed.encrypted) {
        logger.info("KKTP: Processing group message", {
          groupMailboxId: parsed.groupMailboxId.slice(0, 16),
          senderPubSig: parsed.encrypted?.senderPubSig?.slice(0, 16),
        });
        try {
          const handled = await lobbyManager.handler.processGroupMessage(
            parsed.groupMailboxId,
            parsed.encrypted,
          );
          if (handled) {
            logger.info("KKTP: Group message handled successfully", {
              groupMailboxId: parsed.groupMailboxId.slice(0, 16),
            });
            logEvent("Lobby message received", "info");
            // Re-render lobby chat if in lobby mode
            if (dashboardState.activeLobbySelected && dashboardState.activeLobby) {
              renderLobbyChatMessages(
                lobbyManager.messageHistory,
                dashboardState.myPubSig,
              );
            }
            deps.scheduleSessionSave?.();
          }
        } catch (err) {
          logger.warn("KKTP: Failed to process group message", {
            error: err.message,
          });
        }
        continue; // Don't process as regular KKTP payload
      }
    }

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

      // CRITICAL: Subscribe to DM mailbox so we can receive messages on this session
      // The prefix format is KKTP:{mailboxId}:
      if (event.mailboxId) {
        const dmPrefix = `KKTP:${event.mailboxId}:`;
        try {
          kaspaPortal.addPrefix(dmPrefix);
          logger.info("KKTP Events: Subscribed to DM mailbox", {
            mailboxId: event.mailboxId?.slice(0, 16),
            prefix: dmPrefix.slice(0, 32),
          });
        } catch (err) {
          logger.warn("KKTP Events: Failed to subscribe to DM mailbox", {
            error: err.message,
          });
        }
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
        logger.info("KKTP Events: Processing incoming messages", {
          mailboxId: event.mailboxId?.slice(0, 16),
          messageCount: event.messages.length,
        });

        // Route messages through LobbyMessageHandler to detect lobby DMs
        const lobbyManager = dashboardState.lobbyManager;
        if (lobbyManager && event.mailboxId) {
          for (let i = 0; i < event.messages.length; i++) {
            const msg = event.messages[i];
            const plaintext = msg?.plaintext ?? msg;

            logger.debug("KKTP Events: Processing message", {
              index: i,
              isString: typeof plaintext === "string",
              startsWithBrace: typeof plaintext === "string" && plaintext.trim().startsWith("{"),
              previewLength: plaintext?.length ?? 0,
            });

            if (typeof plaintext === "string" && plaintext.trim().startsWith("{")) {
              try {
                const handled = lobbyManager.handler.processDMMessage(
                  event.mailboxId,
                  plaintext,
                );
                if (handled) {
                  logger.info("KKTP Events: Lobby DM message handled successfully", {
                    mailboxId: event.mailboxId?.slice(0, 8),
                    lobbyState: lobbyManager.state,
                    isHost: lobbyManager.isHost,
                    memberCount: lobbyManager.members?.length,
                  });

                  // Update lobby UI after processing lobby message
                  renderLobbyMembers(lobbyManager.members, lobbyManager.isHost);
                  updateLobbyStatus(lobbyManager.lobbyInfo);

                  // If in lobby mode, update the chat
                  if (dashboardState.activeLobbySelected) {
                    renderLobbyChatMessages(
                      lobbyManager.messageHistory,
                      dashboardState.myPubSig,
                    );
                  }
                } else {
                  logger.debug("KKTP Events: Message not a lobby message", {
                    mailboxId: event.mailboxId?.slice(0, 8),
                  });
                }
              } catch (err) {
                logger.warn("KKTP Events: Error processing lobby DM", {
                  error: err.message,
                  mailboxId: event.mailboxId?.slice(0, 8),
                });
              }
            }
          }
        } else {
          logger.debug("KKTP Events: No lobbyManager or mailboxId for message routing", {
            hasLobbyManager: !!lobbyManager,
            hasMailboxId: !!event.mailboxId,
          });
        }
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
  logger.debug("KKTP: discovery anchor received", {
    sid: discovery.sid,
    pub_sig: discovery.pub_sig,
    meta: discovery.meta || discovery.metadata || {},
    isLobby: discovery?.meta?.lobby === true,
    timestamp: discovery.timestamp || discovery.time || null,
    discoveredAt,
    now,
  });

  const expectedEndMs = getExpectedEndMs(
    discovery,
    discovery?.timestamp || discovery?.time || discoveredAt || now,
  );
  logger.debug("KKTP: discovery expiry computed", {
    sid: discovery.sid,
    expectedEndMs,
    now,
    isExpired: expectedEndMs ? now > expectedEndMs : null,
  });
  if (expectedEndMs && now > expectedEndMs) {
    logger.info("KKTP: discovery anchor expired", {
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
    // Refresh both peer list and lobby list
    renderPeerList(deps.handleConnectToPeer);
    renderDiscoveredLobbies(deps.handleJoinLobby);
  } else {
    logger.debug("KKTP: discovery already tracked", {
      sid: discovery.sid,
      pub_sig: discovery.pub_sig,
    });
  }
}
