// sync.js - Blockchain intelligence layer (DAG sync + catch-up)
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
import { hexToString } from "../../wrapper/utilities/utilities.js";
import { dashboardState } from "./state.js";
import { elements } from "./dom.js";
import { logEvent, setMissedStatus, updateScannerStatus } from "./ui.js";
import {
  getStoredDiscoveryBlockHash,
  setStoredDiscoveryBlockHash,
  loadSessionSnapshot,
} from "./storage.js";

const KKTP_PREFIX = "KKTP:";

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
  { handleIncomingEvent, logPrefix = "DAG" } = {},
) {
  if (!startHash) return 0;

  updateScannerStatus("syncing");

  logEvent(`[${logPrefix}] Sync start @ ${startHash.slice(0, 8)}...`, "info");

  const pendingPayloads = [];
  const seen = dashboardState.processedTxIds;

  await kaspaPortal.syncFrom(
    startHash,
    (line) => logEvent(`[${logPrefix}] ${line}`, "info"),
    {
      prefixes: [KKTP_PREFIX],
      onTransactionMatch: [
        ({ tx }) => {
          const txId = tx?.txid || "";
          if (txId && seen.has(txId)) return false;
          if (txId) seen.add(txId);

          const payloadHex = tx?.payload || "";
          const payload = decodeHexPayload(payloadHex);
          if (payload && payload.startsWith(KKTP_PREFIX)) {
            pendingPayloads.push({ payload });
          }
          return false;
        },
      ],
    },
  );

  for (const item of pendingPayloads) {
    const event = await kaspaPortal.processIncomingPayload(item.payload);
    if (event && typeof handleIncomingEvent === "function") {
      handleIncomingEvent(event);
    }
  }

  logEvent(
    `[${logPrefix}] Sync done. Payloads=${pendingPayloads.length}`,
    "info",
  );
  updateScannerStatus("ready");

  return pendingPayloads.length;
}

export async function recoverSessionsOnLoad({
  storageKeyPrefix,
  networkId,
  walletAddress,
  handleIncomingEvent,
  refreshSessionList,
  scheduleSessionSave,
} = {}) {
  const startHash = getStoredDiscoveryBlockHash();

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
      logEvent("Restore step: DAG sync", "info");
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
} = {}) {
  if (!kaspaPortal.isReady) {
    logEvent("Not connected. Connect first.", "error");
    return;
  }

  const manual = elements.missedStartHashInput?.value?.trim() || "";
  const startHash = manual || getStoredDiscoveryBlockHash();

  if (!startHash) {
    setMissedStatus("No start hash. Provide one or send a discovery first.");
    return;
  }

  setMissedStatus("Scanning for missed messages...");
  if (elements.btnFetchMissed) elements.btnFetchMissed.disabled = true;

  const pendingPayloads = [];
  const seen = dashboardState.processedTxIds;

  try {
    await kaspaPortal.syncFrom(
      startHash,
      (line) => logEvent(`[DAG] ${line}`, "info"),
      {
        prefixes: [KKTP_PREFIX],
        onTransactionMatch: [
          ({ block, tx }) => {
            const txId = tx?.txid || "";
            if (txId && seen.has(txId)) return false;
            if (txId) seen.add(txId);

            const payloadHex = tx?.payload || "";
            const payload = decodeHexPayload(payloadHex);
            if (payload && payload.startsWith(KKTP_PREFIX)) {
              pendingPayloads.push({
                payload,
                blockHash: block?.hash || tx?.blockHash || "",
                txId,
              });
            }
            return false;
          },
        ],
      },
    );

    for (const item of pendingPayloads) {
      const event = await kaspaPortal.processIncomingPayload(item.payload);
      if (event && typeof handleIncomingEvent === "function") {
        handleIncomingEvent(event);
        if (event.type === "discovery" && item.blockHash) {
          setStoredDiscoveryBlockHash(item.blockHash);
        }
        scheduleSessionSave?.();
      }
    }

    setMissedStatus(
      `Scan complete. Found ${pendingPayloads.length} KKTP payload(s).`,
    );
  } catch (err) {
    logEvent(`Missed scan failed: ${err.message}`, "error");
    setMissedStatus(`Scan failed: ${err.message}`);
  } finally {
    if (elements.btnFetchMissed) elements.btnFetchMissed.disabled = false;
  }
}
