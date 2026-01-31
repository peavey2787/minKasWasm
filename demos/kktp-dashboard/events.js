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
  setJoinStatus,
} from "./ui.js";
import { decodeHexPayload } from "./sync.js";
import { setStoredDiscoveryBlockHash, setStoredLastSeenBlockHash } from "./storage.js";
import { getExpectedEndMs } from "../../kktp/protocol/sessions/index.js";

const KKTP_PREFIX = "KKTP:";

// ─────────────────────────────────────────────────────────────
// Lobby Facade Access - DM buffer is now in LobbyFacade
// ─────────────────────────────────────────────────────────────

/**
 * Get the lobby facade from dashboard state
 * @returns {import('../../kktp/lobby/lobbyFacade.js').LobbyFacade|null}
 */
function getLobby() {
  return dashboardState.lobbyManager ?? null;
}

/**
 * Process any buffered DM messages for a mailbox via the lobby module.
 * Called when a session is established to handle early-arriving messages.
 */
async function processPendingDMMessages(mailboxId, deps = {}) {
  const lobby = getLobby();
  if (!lobby) return;

  const bufferedMessages = lobby.popBufferedMessages(mailboxId);
  if (bufferedMessages.length === 0) return;

  logger.info("KKTP Events: Processing buffered DM messages", {
    mailboxId: mailboxId?.slice(0, 16),
    count: bufferedMessages.length,
  });

  for (const { payload, timestamp } of bufferedMessages) {
    try {
      const event = await kaspaPortal.processIncomingPayload(payload);
      if (event) {
        event._receivedAt = timestamp || Date.now();
        handleIncomingEvent(event, deps);
      }
    } catch (err) {
      logger.warn("KKTP Events: Failed to process buffered DM", {
        mailboxId: mailboxId?.slice(0, 16),
        error: err.message,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Match Helpers
// ─────────────────────────────────────────────────────────────

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
  setJoinStatus(`Last discovery seen @ ${blockHash.slice(0, 8)}...`);
}

/**
 * Store last seen block hash for any KKTP match
 * This allows DAG walks to resume from where we left off
 * @param {Object} matchObj - The match object containing block hash
 */
export function maybeStoreLastSeenBlock(matchObj) {
  const blockHash = getMatchBlockHash(matchObj);
  if (blockHash && blockHash.length === 64) {
    setStoredLastSeenBlockHash(blockHash);
  }
}

export async function handleIncomingMatch(matchObjOrArray, deps = {}) {
  const matches = Array.isArray(matchObjOrArray)
    ? matchObjOrArray
    : [matchObjOrArray];

  // ─────────────────────────────────────────────────────────────
  // FIRST PASS: Categorize all payloads
  // Process anchors first to establish sessions, then DMs, then group messages
  // ─────────────────────────────────────────────────────────────

  const anchors = [];
  const dmMessages = [];
  const groupMessages = [];

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

    const timestamp = getMatchTimestamp(matchObj) || Date.now();

    logger.debug("KKTP: categorizing payload", {
      txId,
      prefix: payload.slice(0, 32),
      size: payload.length,
    });

    // Categorize by payload type
    if (payload.startsWith("KKTP:ANCHOR:")) {
      anchors.push({ payload, timestamp, matchObj });
    } else if (payload.startsWith("KKTP:GROUP:")) {
      groupMessages.push({ payload, timestamp, matchObj });
    } else {
      // DM message format: KKTP:{mailboxId}:{encrypted}
      const colonIdx = payload.indexOf(":", 5); // After "KKTP:"
      if (colonIdx > 5) {
        const mailboxId = payload.slice(5, colonIdx);
        dmMessages.push({ payload, timestamp, matchObj, mailboxId });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SECOND PASS: Process ANCHORS first (establishes sessions)
  // ─────────────────────────────────────────────────────────────

  for (const { payload, timestamp, matchObj } of anchors) {
    try {
      // Update last seen block for every KKTP match
      maybeStoreLastSeenBlock(matchObj);

      const event = await kaspaPortal.processIncomingPayload(payload);
      if (event) {
        event._receivedAt = timestamp;
        handleIncomingEvent(event, deps);
        maybeStoreOwnDiscoveryBlock(event, matchObj);

        // If a session was just established, process any buffered DMs for it
        if (event.type === "session_established" && event.mailboxId) {
          await processPendingDMMessages(event.mailboxId, deps);
        }
      }
    } catch (err) {
      logEvent(`Error processing anchor: ${err.message}`, "error");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // THIRD PASS: Process DM messages (session must exist)
  // ─────────────────────────────────────────────────────────────

  const lobby = getLobby();

  for (const { payload, timestamp, mailboxId, matchObj } of dmMessages) {
    // Update last seen block for every KKTP match
    maybeStoreLastSeenBlock(matchObj);

    // Check if session exists for this mailbox
    const session = kaspaPortal.getSession(mailboxId);

    if (!session) {
      // Session doesn't exist yet - check if this mailbox is relevant to our lobby
      // This prevents buffering DMs meant for other peers
      const isRelevant = lobby?.isRelevantMailbox?.(mailboxId) ?? false;

      if (!isRelevant) {
        // This DM is not for any mailbox we care about - skip silently
        logger.debug("KKTP Events: Ignoring DM for unrelated mailbox", {
          mailboxId: mailboxId?.slice(0, 16),
        });
        continue;
      }

      logger.info("KKTP Events: DM arrived before session, buffering", {
        mailboxId: mailboxId?.slice(0, 16),
      });
      lobby?.bufferDMMessage(mailboxId, payload, timestamp);
      continue;
    }

    try {
      const event = await kaspaPortal.processIncomingPayload(payload);
      if (event) {
        event._receivedAt = timestamp;
        handleIncomingEvent(event, deps);
      }
    } catch (err) {
      logger.warn("KKTP Events: Error processing DM", {
        mailboxId: mailboxId?.slice(0, 16),
        error: err.message,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // FOURTH PASS: Process GROUP messages via lobby facade
  // ─────────────────────────────────────────────────────────────

  for (const { payload, timestamp, matchObj } of groupMessages) {
    // Update last seen block for every KKTP match
    maybeStoreLastSeenBlock(matchObj);

    if (!lobby) continue;

    const parsed = lobby.parseGroupPayload(payload);
    if (parsed.isGroup && parsed.groupMailboxId && parsed.encrypted) {
      logger.info("KKTP Events: Processing group message", {
        groupMailboxId: parsed.groupMailboxId.slice(0, 16),
        senderPubSig: parsed.encrypted?.senderPubSig?.slice(0, 16),
      });
      try {
        const handled = await lobby.routeGroupMessage(
          parsed.groupMailboxId,
          parsed.encrypted,
        );
        if (handled) {
          logger.info("KKTP Events: Group message handled successfully", {
            groupMailboxId: parsed.groupMailboxId.slice(0, 16),
          });
          logEvent("Lobby message received", "info");
          if (dashboardState.activeLobbySelected && dashboardState.activeLobby) {
            renderLobbyChatMessages(
              lobby.messageHistory,
              dashboardState.myPubSig,
            );
          }
        }
      } catch (err) {
        logger.warn("KKTP Events: Failed to process group message", {
          error: err.message,
        });
      }
    }
  }

  // Save session state if anything was processed
  if (anchors.length > 0 || dmMessages.length > 0 || groupMessages.length > 0) {
    deps.scheduleSessionSave?.();
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
    case "session_established": {
      logEvent(
        `Session established: ${event.mailboxId.substring(0, 8)}...`,
        "success",
      );
      if (event.response?.sid) {
        removeDiscoveredPeer(event.response.sid);
      }

      // CRITICAL: Subscribe to DM mailbox so we can receive messages on this session
      // Delegate to lobby facade for self-contained subscription management
      const lobby = getLobby();
      if (event.mailboxId) {
        if (lobby) {
          // Let lobby track the subscription for proper cleanup
          lobby.subscribeToDMMailbox(event.mailboxId);
        } else {
          // Fallback: subscribe directly via portal if no lobby
          const dmPrefix = `KKTP:${event.mailboxId}:`;
          try {
            kaspaPortal.addPrefix(dmPrefix);
            logger.info("KKTP Events: Subscribed to DM mailbox (no lobby)", {
              mailboxId: event.mailboxId?.slice(0, 16),
            });
          } catch (err) {
            logger.warn("KKTP Events: Failed to subscribe to DM mailbox", {
              error: err.message,
            });
          }
        }
      }

      renderPeerList(deps.handleConnectToPeer);
      deps.refreshSessionList?.();

      // CRITICAL: Don't auto-select 1:1 sessions if we're in lobby mode
      // This prevents the UI from switching away from lobby chat
      const isInLobby = lobby?.isInLobby?.() || dashboardState.activeLobbySelected;

      if (!isInLobby && !dashboardState.activeSessionId) {
        // Only auto-select if we're NOT in lobby mode AND no session is active
        deps.selectSession?.(event.mailboxId);
      } else if (isInLobby) {
        // We're in a lobby - don't switch UI to 1:1 DM
        logger.debug("KKTP Events: Session established during lobby mode, not switching UI", {
          mailboxId: event.mailboxId?.slice(0, 16),
          activeLobbySelected: dashboardState.activeLobbySelected,
          lobbyState: lobby?.currentState,
        });
      }
      break;
    }
    case "messages":
      if (event.messages?.length > 0) {
        logEvent(`Received ${event.messages.length} message(s)`, "info");
        logger.info("KKTP Events: Processing incoming messages", {
          mailboxId: event.mailboxId?.slice(0, 16),
          messageCount: event.messages.length,
        });

        // Route messages through LobbyFacade to detect lobby DMs
        const lobby = getLobby();
        if (lobby && event.mailboxId) {
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
                const handled = lobby.routeDMMessage(
                  event.mailboxId,
                  plaintext,
                );
                if (handled) {
                  logger.info("KKTP Events: Lobby DM message handled successfully", {
                    mailboxId: event.mailboxId?.slice(0, 8),
                    lobbyState: lobby.currentState,
                    isHost: lobby.isHost,
                    memberCount: lobby.members?.length,
                  });

                  // Update lobby UI after processing lobby message
                  renderLobbyMembers(lobby.members, lobby.isHost);
                  updateLobbyStatus(lobby.lobbyInfo);

                  // If in lobby mode, update the chat
                  if (dashboardState.activeLobbySelected) {
                    renderLobbyChatMessages(
                      lobby.messageHistory,
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
          logger.debug("KKTP Events: No lobby or mailboxId for message routing", {
            hasLobby: !!lobby,
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
        // Clear any pending buffered messages for this session via lobby
        getLobby()?.clearBufferedMessages(event.mailboxId);
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
