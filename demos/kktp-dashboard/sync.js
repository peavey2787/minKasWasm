// sync.js - Blockchain intelligence layer (DAG sync + catch-up)
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
import { hexToString } from "../../wrapper/utilities/utilities.js";
import { dashboardState } from "./state.js";
import { elements } from "./dom.js";
import { logEvent, setMissedStatus, updateScannerStatus } from "./ui.js";
import {
  getStoredDiscoveryBlockHash,
  setStoredDiscoveryBlockHash,
  getStoredLastSeenBlockHash,
  setStoredLastSeenBlockHash,
  loadSessionSnapshot,
} from "./storage.js";

const KKTP_PREFIX = "KKTP:";
const DAG_WALK_UNLIMITED_SECONDS = 86400; // 24hrs

// ─────────────────────────────────────────────────────────────
// DAG Walk State Management
// ─────────────────────────────────────────────────────────────

/**
 * Active DAG walk state - tracks current walk progress and allows stopping
 */
const activeDagWalk = {
  isActive: false,
  stopped: false,
  blocksProcessed: 0,
  startedAt: 0,
  lastBlockHash: "",
  startHash: "",
};

// Update last seen block hash every N blocks to avoid excessive writes
const BLOCK_HASH_UPDATE_INTERVAL = 100;

/**
 * Stop the current DAG walk if one is in progress
 * @returns {boolean} True if a walk was stopped, false if none was active
 */
export function stopDagWalk() {
  if (!activeDagWalk.isActive) {
    return false;
  }
  activeDagWalk.stopped = true;
  logEvent("DAG walk stop requested...", "info");
  return true;
}

/**
 * Check if a DAG walk is currently in progress
 * @returns {boolean}
 */
export function isDagWalkActive() {
  return activeDagWalk.isActive;
}

/**
 * Get current DAG walk progress info
 * @returns {{ blocksProcessed: number, elapsedMs: number, lastBlockHash: string } | null}
 */
export function getDagWalkProgress() {
  if (!activeDagWalk.isActive) return null;
  return {
    blocksProcessed: activeDagWalk.blocksProcessed,
    elapsedMs: Date.now() - activeDagWalk.startedAt,
    lastBlockHash: activeDagWalk.lastBlockHash,
  };
}

/**
 * Get the best starting block hash for DAG walks
 * Priority: manual input > lastSeenBlockHash > discoveryBlockHash
 * @param {string} [manualHash] - Optional manually provided hash
 * @returns {{ hash: string, source: "manual" | "lastSeen" | "discovery" | "none" }}
 */
export function getBestStartHash(manualHash = "") {
  const manual = manualHash?.trim() || "";
  if (manual && manual.length === 64) {
    return { hash: manual, source: "manual" };
  }

  const lastSeen = getStoredLastSeenBlockHash();
  if (lastSeen && lastSeen.length === 64) {
    return { hash: lastSeen, source: "lastSeen" };
  }

  const discovery = getStoredDiscoveryBlockHash();
  if (discovery && discovery.length === 64) {
    return { hash: discovery, source: "discovery" };
  }

  return { hash: "", source: "none" };
}

export function decodeHexPayload(payloadHex) {
  try {
    if (!payloadHex) return "";
    return hexToString(payloadHex);
  } catch {
    return "";
  }
}

async function restoreSavedSessions({
  networkId,
  walletAddress,
  scheduleSessionSave,
} = {}) {
  const snap = await loadSessionSnapshot({ networkId, walletAddress });
  if (!snap) {
    console.info("KKTP: restoreSavedSessions no snapshot");
    return;
  }
  console.info(
    "KKTP: restoreSavedSessions",
    JSON.stringify({
      sessionCount: Array.isArray(snap?.sessions) ? snap.sessions.length : 0,
    }),
  );
  await kaspaPortal.restoreSessions(snap, { skipExpired: true });
  kaspaPortal.pruneExpiredSessions();
  scheduleSessionSave?.();
}

export async function syncFromStartHash(
  startHash,
  {
    handleIncomingEvent,
    logPrefix = "DAG",
    onProgress = null,
    maxSeconds = DAG_WALK_UNLIMITED_SECONDS,
  } = {},
) {
  if (!startHash) return 0;

  // Initialize walk state
  activeDagWalk.isActive = true;
  activeDagWalk.stopped = false;
  activeDagWalk.blocksProcessed = 0;
  activeDagWalk.startedAt = Date.now();
  activeDagWalk.lastBlockHash = startHash;
  activeDagWalk.startHash = startHash;

  updateScannerStatus("syncing");
  logEvent(`[${logPrefix}] Sync start @ ${startHash.slice(0, 8)}... (unlimited)`, "info");

  const pendingPayloads = [];
  const seen = dashboardState.processedTxIds;
  let lastHashUpdateAt = 0;

  try {
    await kaspaPortal.syncFrom(
      startHash,
      (line) => logEvent(`[${logPrefix}] ${line}`, "info"),
      {
        prefixes: [KKTP_PREFIX],
        maxSeconds: DAG_WALK_UNLIMITED_SECONDS,
        onTransactionMatch: [
          ({ block, tx }) => {
            // Check if walk was stopped
            if (activeDagWalk.stopped) {
              return true; // Signal to stop
            }

            activeDagWalk.blocksProcessed++;

            // Track latest block hash for progress
            const blockHash = block?.hash || tx?.blockHash || "";
            if (blockHash) {
              activeDagWalk.lastBlockHash = blockHash;

              // Update stored last seen hash periodically
              if (activeDagWalk.blocksProcessed - lastHashUpdateAt >= BLOCK_HASH_UPDATE_INTERVAL) {
                setStoredLastSeenBlockHash(blockHash);
                lastHashUpdateAt = activeDagWalk.blocksProcessed;
              }
            }

            // Report progress
            if (typeof onProgress === "function") {
              onProgress({
                blocksProcessed: activeDagWalk.blocksProcessed,
                elapsedMs: Date.now() - activeDagWalk.startedAt,
                lastBlockHash: blockHash,
              });
            }

            const txId = tx?.txid || "";
            if (txId && seen.has(txId)) return false;
            if (txId) seen.add(txId);

            const payloadHex = tx?.payload || "";
            const payload = decodeHexPayload(payloadHex);
            if (payload && payload.startsWith(KKTP_PREFIX)) {
              pendingPayloads.push({
                payload,
                blockHash,
                txId,
                receivedAt:
                  block?.timestamp ||
                  tx?.timestamp ||
                  tx?.verboseData?.timestamp ||
                  Date.now(),
              });

              // Store last seen for every KKTP match immediately
              if (blockHash) {
                setStoredLastSeenBlockHash(blockHash);
              }
            }
            return false;
          },
        ],
      },
    );

    // Process all collected payloads
    for (const item of pendingPayloads) {
      const event = await kaspaPortal.processIncomingPayload(item.payload);
      if (event && typeof handleIncomingEvent === "function") {
        event._receivedAt = item.receivedAt;
        event._blockHash = item.blockHash;
        handleIncomingEvent(event);
      }
    }

    // Final update of last seen block hash
    if (activeDagWalk.lastBlockHash) {
      setStoredLastSeenBlockHash(activeDagWalk.lastBlockHash);
    }

    const status = activeDagWalk.stopped ? "stopped" : "done";
    const elapsed = Math.round((Date.now() - activeDagWalk.startedAt) / 1000);
    logEvent(
      `[${logPrefix}] Sync ${status}. Blocks=${activeDagWalk.blocksProcessed}, Payloads=${pendingPayloads.length}, Time=${elapsed}s`,
      "info",
    );
    updateScannerStatus("ready");

    return pendingPayloads.length;
  } finally {
    // Always clean up walk state
    activeDagWalk.isActive = false;
    activeDagWalk.stopped = false;
  }
}

export async function recoverSessionsOnLoad({
  storageKeyPrefix,
  networkId,
  walletAddress,
  handleIncomingEvent,
  refreshSessionList,
  scheduleSessionSave,
} = {}) {
  const { hash: startHash, source: hashSource } = getBestStartHash();

  // Step 0: Restore snapshots first (needed to re-register pending discoveries)
  logEvent("Restore step: snapshot", "info");
  await restoreSavedSessions({
    networkId,
    walletAddress,
    scheduleSessionSave,
  });

  // Step 1: DAG sync is PRIMARY - must catch peer's session change requests first
  let dagRecoveredSessions = 0;
  if (startHash) {
    try {
      logEvent(`Restore step: DAG sync (from ${hashSource})`, "info");
      const processed = await syncFromStartHash(startHash, {
        handleIncomingEvent,
        logPrefix: "SYNC",
      });
      if (processed > 0) {
        logEvent(`Startup sync processed ${processed} payload(s).`, "info");
      }
      dagRecoveredSessions = kaspaPortal.getSessions().length;
      if (dagRecoveredSessions > 0) {
        logEvent(
          `Recovered ${dagRecoveredSessions} session(s) from DAG`,
          "success",
        );
      }
    } catch (err) {
      logEvent(`DAG sync failed: ${err.message}`, "error");
    }
  }

  if (!startHash) {
    logEvent("Restore step: DAG sync skipped (no start hash)", "info");
  }

  // Step 2: If DAG sync didn't recover sessions, try resume blob as FALLBACK
  if (dagRecoveredSessions === 0 && startHash) {
    try {
      logEvent("Restore step: resume blob fallback", "info");
      const result = await kaspaPortal.resumeSession({
        startHash,
        storageKeyPrefix,
        logFn: null, // silent - fallback only
      });

      if (result?.status === "handover_complete") {
        logEvent("Session resumed from blob", "success");
      } else if (
        result?.status &&
        result.status !== "no_resume_blob" &&
        result.status !== "invalid_resume_blob"
      ) {
        logEvent(`Resume status: ${result.status}`, "info");
      }
    } catch (err) {
      logEvent(`Resume fallback error: ${err.message}`, "error");
    }
  }

  // Step 3: Post-sync rotation handover - handle race conditions
  // If sessions are FAULTED, peer may have rotated keys during our refresh
  logEvent("Restore step: post-sync handover", "info");
  await handlePostSyncRotationHandover({
    handleIncomingEvent,
    scheduleSessionSave,
  });

  refreshSessionList?.();
}

/**
 * Post-Sync Rotation Handover
 * Handles race conditions where peer may have rotated keys during our refresh.
 * Checks for FAULTED sessions and attempts to re-establish using the peer registry.
 */
async function handlePostSyncRotationHandover({
  handleIncomingEvent,
  scheduleSessionSave,
} = {}) {
  const sessions = kaspaPortal.getSessions();
  const faultedSessions = sessions.filter(
    (s) => s.sm?.state === "FAULTED" || s.state === "FAULTED",
  );

  if (faultedSessions.length === 0) return;

  logEvent(
    `Post-sync handover: ${faultedSessions.length} faulted session(s) detected`,
    "info",
  );

  for (const session of faultedSessions) {
    const peerPubSig = session.peerPubSig || session.discovery?.pub_sig;
    if (!peerPubSig) {
      logEvent("Faulted session has no peer identity - skipping", "error");
      continue;
    }

    try {
      // Option A: Check if peer sent a new discovery on-chain during our downtime
      // This would be caught by syncFromStartHash, but we can re-process
      const pendingDiscoveries = kaspaPortal._sessionManager?._kktpPendingDiscoveries;
      const orphanResponses = kaspaPortal._sessionManager?._kktpOrphanResponses;

      // Check if there's an orphan response we can use to re-establish
      if (orphanResponses?.size > 0) {
        for (const [sid, orphanResponse] of orphanResponses.entries()) {
          if (orphanResponse.pub_sig_resp === peerPubSig) {
            logEvent(
              `Found orphan response for faulted peer ${peerPubSig.slice(0, 8)}...`,
              "info",
            );
            // Attempt to re-process the orphan
            const event = await kaspaPortal.processIncomingPayload(
              `KKTP:ANCHOR:${JSON.stringify(orphanResponse)}`,
            );
            if (event && handleIncomingEvent) {
              handleIncomingEvent(event);
              scheduleSessionSave?.();
            }
            break;
          }
        }
      }

      // Option B: If we still have a faulted session, mark it for re-keying
      // The next message exchange will use fresh keys from the peer registry
      const stillFaulted =
        session.sm?.state === "FAULTED" || session.state === "FAULTED";
      if (stillFaulted) {
        logEvent(
          `Session with ${peerPubSig.slice(0, 8)}... remains faulted - awaiting peer re-discovery`,
          "info",
        );
        // Clean up the faulted session so peer can re-initiate
        const mailboxId = session.mailboxId || session.sm?.kktp?.mailboxId;
        if (mailboxId) {
          kaspaPortal.closeSession(mailboxId);
          logEvent(
            `Closed faulted session ${mailboxId.slice(0, 8)}... - peer can re-initiate`,
            "info",
          );
        }
      }
    } catch (err) {
      logEvent(
        `Handover failed for ${peerPubSig.slice(0, 8)}...: ${err.message}`,
        "error",
      );
    }
  }
}

export async function handleFetchMissed({
  handleIncomingEvent,
  scheduleSessionSave,
  onProgress = null,
} = {}) {
  if (!kaspaPortal.isReady) {
    logEvent("Not connected. Connect first.", "error");
    return;
  }

  // Check if a walk is already active
  if (isDagWalkActive()) {
    logEvent("DAG walk already in progress. Stop it first or wait.", "error");
    setMissedStatus("Walk already active - use Stop button");
    return;
  }

  const manual = elements.missedStartHashInput?.value?.trim() || "";
  const { hash: startHash, source: hashSource } = getBestStartHash(manual);

  if (!startHash) {
    setMissedStatus("No start hash. Provide one or send a discovery first.");
    return;
  }

  setMissedStatus(`Scanning from ${hashSource} hash (unlimited)...`);
  if (elements.btnFetchMissed) elements.btnFetchMissed.disabled = true;

  // Initialize walk state
  activeDagWalk.isActive = true;
  activeDagWalk.stopped = false;
  activeDagWalk.blocksProcessed = 0;
  activeDagWalk.startedAt = Date.now();
  activeDagWalk.lastBlockHash = startHash;
  activeDagWalk.startHash = startHash;

  const pendingPayloads = [];
  const seen = dashboardState.processedTxIds;

  try {
    await kaspaPortal.syncFrom(
      startHash,
      (line) => logEvent(`[DAG] ${line}`, "info"),
      {
        prefixes: [KKTP_PREFIX],
        maxSeconds: DAG_WALK_UNLIMITED_SECONDS,
        onTransactionMatch: [
          ({ block, tx }) => {
            // Check if walk was stopped
            if (activeDagWalk.stopped) {
              return true; // Signal to stop
            }

            activeDagWalk.blocksProcessed++;
            const blockHash = block?.hash || tx?.blockHash || "";

            if (blockHash) {
              activeDagWalk.lastBlockHash = blockHash;
            }

            // Report progress
            if (typeof onProgress === "function") {
              onProgress({
                blocksProcessed: activeDagWalk.blocksProcessed,
                elapsedMs: Date.now() - activeDagWalk.startedAt,
                lastBlockHash: blockHash,
              });
            }

            const txId = tx?.txid || "";
            if (txId && seen.has(txId)) return false;
            if (txId) seen.add(txId);

            const payloadHex = tx?.payload || "";
            const payload = decodeHexPayload(payloadHex);
            if (payload && payload.startsWith(KKTP_PREFIX)) {
              pendingPayloads.push({
                payload,
                blockHash,
                txId,
                receivedAt:
                  block?.timestamp ||
                  tx?.timestamp ||
                  tx?.verboseData?.timestamp ||
                  Date.now(),
              });

              // Update last seen for every KKTP match
              if (blockHash) {
                setStoredLastSeenBlockHash(blockHash);
              }
            }
            return false;
          },
        ],
      },
    );

    for (const item of pendingPayloads) {
      const event = await kaspaPortal.processIncomingPayload(item.payload);
      if (event && typeof handleIncomingEvent === "function") {
        event._receivedAt = item.receivedAt;
        event._blockHash = item.blockHash;
        handleIncomingEvent(event);
        if (event.type === "discovery" && item.blockHash) {
          setStoredDiscoveryBlockHash(item.blockHash);
        }
        scheduleSessionSave?.();
      }
    }

    // Final update of last seen hash
    if (activeDagWalk.lastBlockHash) {
      setStoredLastSeenBlockHash(activeDagWalk.lastBlockHash);
    }

    const status = activeDagWalk.stopped ? "stopped by user" : "caught up";
    setMissedStatus(
      `Scan ${status}. Found ${pendingPayloads.length} KKTP payload(s).`,
    );
  } catch (err) {
    logEvent(`Missed scan failed: ${err.message}`, "error");
    setMissedStatus(`Scan failed: ${err.message}`);
  } finally {
    if (elements.btnFetchMissed) elements.btnFetchMissed.disabled = false;
    activeDagWalk.isActive = false;
    activeDagWalk.stopped = false;
  }
}
