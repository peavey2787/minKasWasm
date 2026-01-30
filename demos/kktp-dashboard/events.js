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
import { setStoredDiscoveryBlockHash, setStoredLastSeenBlockHash } from "./storage.js";
import { getExpectedEndMs } from "../../kktp/protocol/sessions/index.js";

const KKTP_PREFIX = "KKTP:";

// ─────────────────────────────────────────────────────────────
// DM Message Buffer - Handles race condition where DM arrives before session
// ─────────────────────────────────────────────────────────────

const DM_BUFFER_TTL_MS = 30_000; // 30 seconds TTL for buffered messages
const DM_BUFFER_MAX_PER_MAILBOX = 5; // Max messages per mailbox to prevent spam
const DM_BUFFER_CLEANUP_INTERVAL_MS = 10_000; // Cleanup every 10 seconds

// Buffer: mailboxId -> [{ payload, timestamp, bufferedAt }]
const pendingDMBuffer = new Map();
let bufferCleanupTimer = null;

/**
 * Buffer a DM message for later processing when session is established
 */
function bufferDMMessage(mailboxId, payload, timestamp) {
  const now = Date.now();

  if (!pendingDMBuffer.has(mailboxId)) {
    pendingDMBuffer.set(mailboxId, []);
  }

  const buffer = pendingDMBuffer.get(mailboxId);

  // Limit buffer size per mailbox to prevent spam attacks
  if (buffer.length >= DM_BUFFER_MAX_PER_MAILBOX) {
    logger.warn("KKTP: DM buffer full for mailbox, dropping oldest", {
      mailboxId: mailboxId?.slice(0, 16),
      bufferSize: buffer.length,
    });
    buffer.shift(); // Remove oldest
  }

  buffer.push({ payload, timestamp, bufferedAt: now });

  logger.info("KKTP: Buffered early DM message", {
    mailboxId: mailboxId?.slice(0, 16),
    bufferSize: buffer.length,
    ttlMs: DM_BUFFER_TTL_MS,
  });

  // Start cleanup timer if not running
  startBufferCleanup();
}

/**
 * Process any buffered DM messages for a mailbox
 */
async function processPendingDMMessages(mailboxId, deps = {}) {
  const buffer = pendingDMBuffer.get(mailboxId);
  if (!buffer || buffer.length === 0) return;

  const now = Date.now();

  // Filter out expired messages
  const validMessages = buffer.filter(
    (msg) => now - msg.bufferedAt < DM_BUFFER_TTL_MS
  );

  if (validMessages.length === 0) {
    pendingDMBuffer.delete(mailboxId);
    return;
  }

  logger.info("KKTP: Processing buffered DM messages", {
    mailboxId: mailboxId?.slice(0, 16),
    count: validMessages.length,
    droppedExpired: buffer.length - validMessages.length,
  });

  // Clear buffer before processing to avoid loops
  pendingDMBuffer.delete(mailboxId);

  for (const { payload, timestamp } of validMessages) {
    try {
      const event = await kaspaPortal.processIncomingPayload(payload);
      if (event) {
        event._receivedAt = timestamp || Date.now();
        handleIncomingEvent(event, deps);
      }
    } catch (err) {
      logger.warn("KKTP: Failed to process buffered DM", {
        mailboxId: mailboxId?.slice(0, 16),
        error: err.message,
      });
    }
  }
}

/**
 * Clean up expired buffer entries
 */
function cleanupExpiredBuffers() {
  const now = Date.now();
  let totalCleaned = 0;

  for (const [mailboxId, buffer] of pendingDMBuffer.entries()) {
    const validMessages = buffer.filter(
      (msg) => now - msg.bufferedAt < DM_BUFFER_TTL_MS
    );

    if (validMessages.length === 0) {
      pendingDMBuffer.delete(mailboxId);
      totalCleaned += buffer.length;
    } else if (validMessages.length < buffer.length) {
      totalCleaned += buffer.length - validMessages.length;
      pendingDMBuffer.set(mailboxId, validMessages);
    }
  }

  if (totalCleaned > 0) {
    logger.debug("KKTP: Cleaned expired DM buffer entries", {
      cleaned: totalCleaned,
      remainingMailboxes: pendingDMBuffer.size,
    });
  }

  // Stop cleanup timer if buffer is empty
  if (pendingDMBuffer.size === 0 && bufferCleanupTimer) {
    clearInterval(bufferCleanupTimer);
    bufferCleanupTimer = null;
  }
}

/**
 * Start the buffer cleanup timer if not already running
 */
function startBufferCleanup() {
  if (bufferCleanupTimer) return;
  bufferCleanupTimer = setInterval(cleanupExpiredBuffers, DM_BUFFER_CLEANUP_INTERVAL_MS);
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
  setMissedStatus(`Last discovery seen @ ${blockHash.slice(0, 8)}...`);
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

  for (const { payload, timestamp, mailboxId, matchObj } of dmMessages) {
    // Update last seen block for every KKTP match
    maybeStoreLastSeenBlock(matchObj);

    // Check if session exists for this mailbox
    const session = kaspaPortal.getSession(mailboxId);

    if (!session) {
      // Session doesn't exist yet - buffer the message for later
      logger.info("KKTP: DM arrived before session, buffering", {
        mailboxId: mailboxId?.slice(0, 16),
      });
      bufferDMMessage(mailboxId, payload, timestamp);
      continue;
    }

    try {
      const event = await kaspaPortal.processIncomingPayload(payload);
      if (event) {
        event._receivedAt = timestamp;
        handleIncomingEvent(event, deps);
      }
    } catch (err) {
      logger.warn("KKTP: Error processing DM", {
        mailboxId: mailboxId?.slice(0, 16),
        error: err.message,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // FOURTH PASS: Process GROUP messages
  // ─────────────────────────────────────────────────────────────

  const lobbyManager = dashboardState.lobbyManager;
  for (const { payload, timestamp, matchObj } of groupMessages) {
    // Update last seen block for every KKTP match
    maybeStoreLastSeenBlock(matchObj);

    if (!lobbyManager) continue;

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
          if (dashboardState.activeLobbySelected && dashboardState.activeLobby) {
            renderLobbyChatMessages(
              lobbyManager.messageHistory,
              dashboardState.myPubSig,
            );
          }
        }
      } catch (err) {
        logger.warn("KKTP: Failed to process group message", {
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
        // Clear any pending buffered messages for this session
        pendingDMBuffer.delete(event.mailboxId);
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
