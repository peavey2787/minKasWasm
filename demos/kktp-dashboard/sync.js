// sync.js - Blockchain intelligence layer (DAG sync + catch-up)
//
// OPTIMIZED STRATEGY (2026):
// 1. Start scanner immediately → UI is unlocked, can see live messages
// 2. Capture first live block hash from scanner
// 3. Background walk BACKWARD with PARALLEL RPC requests (50+ concurrent)
// 4. Save progress to IndexedDB so refresh doesn't lose work
// 5. Target: 100+ blocks/second with parallel fetching
//
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
import { hexToString } from "../../wrapper/utilities/utilities.js";
import { dashboardState } from "./state.js";
import { elements } from "./dom.js";
import { logEvent, setJoinStatus } from "./ui.js";
import { logger } from "./logger.js";
import {
  getStoredDiscoveryBlockHash,
  setStoredLastSeenBlockHash,
  loadSessionSnapshot,
} from "./storage.js";

const KKTP_PREFIX = "KKTP:";

// ─────────────────────────────────────────────────────────────
// Parallel Fetch Configuration
// ─────────────────────────────────────────────────────────────

// Number of concurrent RPC requests - tune based on node capacity
const PARALLEL_FETCH_COUNT = 50;

// Batch size for progress saves (save every N blocks)
const PROGRESS_SAVE_INTERVAL = 500;

// IndexedDB configuration for sync progress
const SYNC_DB_NAME = "kktp-sync-progress";
const SYNC_DB_VERSION = 1;
const SYNC_STORE_NAME = "progress";

// Progress expiry (1 hour - after this, start fresh)
const PROGRESS_MAX_AGE_MS = 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// Background Sync State Management
// ─────────────────────────────────────────────────────────────

const backgroundSync = {
  isActive: false,
  stopped: false,
  blocksProcessed: 0,
  startedAt: 0,
  fromHash: "",
  targetHash: "",
  currentHash: "",
  handleIncomingEvent: null,
  scheduleSessionSave: null,
};

let firstLiveBlockHash = null;
let firstLiveBlockCaptured = false;

// ─────────────────────────────────────────────────────────────
// IndexedDB Progress Persistence
// ─────────────────────────────────────────────────────────────

let syncDbPromise = null;

/**
 * Open (or create) the sync progress IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openSyncDb() {
  if (syncDbPromise) return syncDbPromise;

  syncDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(SYNC_DB_NAME, SYNC_DB_VERSION);

    request.onerror = () => {
      syncDbPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: "id" });
      }
    };
  });

  return syncDbPromise;
}

/**
 * Save sync progress to IndexedDB
 * @param {Set<string>} visited - Set of visited block hashes
 * @param {string} currentHash - Current position in the walk
 * @param {string} targetHash - Target hash we're walking toward
 * @param {number} blocksProcessed - Number of blocks processed so far
 */
async function saveSyncProgress(visited, currentHash, targetHash, blocksProcessed) {
  try {
    const db = await openSyncDb();

    // Only save the most recently visited hashes (last 50K) to avoid huge storage
    const visitedArray = Array.from(visited);
    const recentHashes = visitedArray.length > 50000
      ? visitedArray.slice(-50000)
      : visitedArray;

    const progress = {
      id: "current",
      visitedHashes: recentHashes,
      currentHash,
      targetHash,
      blocksProcessed,
      savedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SYNC_STORE_NAME, "readwrite");
      const store = tx.objectStore(SYNC_STORE_NAME);
      const request = store.put(progress);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.warn("KKTP Sync: Failed to save progress to IndexedDB", { error: err.message });
  }
}

/**
 * Load saved sync progress from IndexedDB
 * @returns {Promise<Object|null>}
 */
async function loadSyncProgress() {
  try {
    const db = await openSyncDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SYNC_STORE_NAME, "readonly");
      const store = tx.objectStore(SYNC_STORE_NAME);
      const request = store.get("current");

      request.onsuccess = () => {
        const progress = request.result;

        if (!progress) {
          resolve(null);
          return;
        }

        // Check if progress is still valid (not too old)
        const ageMs = Date.now() - (progress.savedAt || 0);
        if (ageMs > PROGRESS_MAX_AGE_MS) {
          clearSyncProgress().catch(() => {});
          resolve(null);
          return;
        }

        resolve(progress);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.warn("KKTP Sync: Failed to load progress from IndexedDB", { error: err.message });
    return null;
  }
}

/**
 * Clear saved sync progress from IndexedDB
 */
async function clearSyncProgress() {
  try {
    const db = await openSyncDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(SYNC_STORE_NAME, "readwrite");
      const store = tx.objectStore(SYNC_STORE_NAME);
      const request = store.delete("current");

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.debug("KKTP Sync: Failed to clear progress", { error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export function stopBackgroundSync() {
  if (!backgroundSync.isActive) return false;
  backgroundSync.stopped = true;
  logEvent("Background sync stop requested...", "info");
  return true;
}

export function isBackgroundSyncActive() {
  return backgroundSync.isActive;
}

export function getBackgroundSyncProgress() {
  if (!backgroundSync.isActive) return null;
  return {
    blocksProcessed: backgroundSync.blocksProcessed,
    elapsedMs: Date.now() - backgroundSync.startedAt,
    currentHash: backgroundSync.currentHash,
  };
}

export function getBestStartHash(manualHash = "") {
  const manual = manualHash?.trim() || "";
  if (manual && manual.length === 64) {
    return { hash: manual, source: "manual" };
  }

  const lastSeen = localStorage.getItem("kktp:lastSeenBlockHash") || "";
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

// ─────────────────────────────────────────────────────────────
// First Block Capture - Scanner Integration
// ─────────────────────────────────────────────────────────────

export function captureFirstLiveBlock(blockHash) {
  if (firstLiveBlockCaptured || !blockHash) return;

  firstLiveBlockHash = blockHash;
  firstLiveBlockCaptured = true;

  setStoredLastSeenBlockHash(blockHash);

  logger.info("KKTP Sync: First live block captured", { blockHash: blockHash.slice(0, 16) });
  logEvent(`Live block: ${blockHash.slice(0, 8)}...`, "info");

  const targetHash = getStoredDiscoveryBlockHash();

  if (targetHash && targetHash !== blockHash) {
    logEvent(`Background sync queued: ${blockHash.slice(0, 8)}... → ${targetHash.slice(0, 8)}...`, "info");
    setJoinStatus("Background sync queued...");

    setTimeout(() => {
      startBackgroundSync(blockHash, targetHash, {
        handleIncomingEvent: backgroundSync.handleIncomingEvent,
        scheduleSessionSave: backgroundSync.scheduleSessionSave,
      });
    }, 3000);
  } else if (!targetHash) {
    logEvent("No saved hash - fresh start, no background sync needed", "info");
  }
}

export function resetFirstBlockCapture() {
  firstLiveBlockHash = null;
  firstLiveBlockCaptured = false;
}

export function getFirstLiveBlockHash() {
  return firstLiveBlockHash;
}

// ─────────────────────────────────────────────────────────────
// Session Restoration
// ─────────────────────────────────────────────────────────────

async function restoreSavedSessions({ networkId, walletAddress, scheduleSessionSave } = {}) {
  const snap = await loadSessionSnapshot({ networkId, walletAddress });
  if (!snap) {
    logger.info("KKTP Sync: No saved snapshot found");
    return;
  }

  logger.info("KKTP Sync: Restoring snapshot", {
    sessionCount: Array.isArray(snap?.sessions) ? snap.sessions.length : 0,
  });

  await kaspaPortal.restoreSessions(snap, { skipExpired: true });
  kaspaPortal.pruneExpiredSessions();
  scheduleSessionSave?.();
}

// ─────────────────────────────────────────────────────────────
// Parallel Block Fetching
// ─────────────────────────────────────────────────────────────

/**
 * Fetch multiple blocks in parallel for dramatically faster sync.
 * @param {Object} client - RPC client
 * @param {string[]} hashes - Block hashes to fetch
 * @returns {Promise<Array<{ hash: string, block: Object|null, error: Error|null }>>}
 */
async function fetchBlocksParallel(client, hashes) {
  const results = await Promise.allSettled(
    hashes.map(async (hash) => {
      try {
        const resp = await client.getBlock({ hash, includeTransactions: true });
        return { hash, block: resp?.block || null, error: null };
      } catch (err) {
        return { hash, block: null, error: err };
      }
    })
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    return { hash: hashes[i], block: null, error: r.reason };
  });
}

/**
 * Extract all parent hashes from a block (handles WASM, REST, and dehydrated formats)
 * @param {Object} block - Block object
 * @returns {string[]} Array of parent hash strings
 */
function extractParentHashes(block) {
  const parents = new Set();

  // WASM format: parentsByLevel is array of arrays
  const parentsByLevel = block.header?.parentsByLevel;
  if (Array.isArray(parentsByLevel)) {
    for (const level of parentsByLevel) {
      if (Array.isArray(level)) {
        for (const hash of level) {
          if (typeof hash === "string" && hash.length === 64) {
            parents.add(hash);
          }
        }
      }
    }
  }

  // REST API format: parents is array of { parentHashes[] }
  const parentsArray = block.header?.parents;
  if (Array.isArray(parentsArray)) {
    for (const group of parentsArray) {
      if (Array.isArray(group?.parentHashes)) {
        for (const hash of group.parentHashes) {
          if (typeof hash === "string" && hash.length === 64) {
            parents.add(hash);
          }
        }
      }
    }
  }

  // Fallback: flat parentHashes array
  const flatParents = block.header?.parentHashes || block.parentHashes;
  if (Array.isArray(flatParents)) {
    for (const hash of flatParents) {
      if (typeof hash === "string" && hash.length === 64) {
        parents.add(hash);
      }
    }
  }

  return Array.from(parents);
}
// ─────────────────────────────────────────────────────────────
// Background Backward Sync (OPTIMIZED with Parallel Fetching)
// ─────────────────────────────────────────────────────────────

/**
 * Start background backward sync with PARALLEL RPC requests.
 *
 * Key optimizations:
 * 1. Fetches PARALLEL_FETCH_COUNT (50) blocks simultaneously
 * 2. Saves progress to IndexedDB periodically to resume after refresh
 * 3. Uses Set for O(1) visited checks
 * 4. Batches parent hash extraction
 *
 * Target: 100-200+ blocks/second (vs 5 blocks/second sequential)
 */
async function startBackgroundSync(
  fromHash,
  targetHash,
  {
    handleIncomingEvent = null,
    scheduleSessionSave = null,
    onProgress = null,
  } = {},
) {
  if (backgroundSync.isActive) {
    logger.warn("KKTP Sync: Background sync already active");
    return;
  }

  if (!fromHash || !targetHash) {
    logger.warn("KKTP Sync: Missing hashes for background sync");
    return;
  }

  if (fromHash === targetHash) {
    logEvent("Already synced to target hash", "success");
    return;
  }

  // Check for saved progress we can resume from
  const savedProgress = await loadSyncProgress();
  let visited = new Set();
  let resuming = false;
  let initialBlocksProcessed = 0;

  if (savedProgress && savedProgress.targetHash === targetHash) {
    // Resume from saved progress
    visited = new Set(savedProgress.visitedHashes || []);
    initialBlocksProcessed = savedProgress.blocksProcessed || 0;
    resuming = true;
    console.log(`🔄 RESUMING SYNC from ${visited.size} previously visited blocks (${initialBlocksProcessed} processed)`);
  } else {
    // Fresh start - clear any old progress
    await clearSyncProgress();
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🚀 PARALLEL BACKGROUND SYNC STARTING");
  console.log(`   From: ${fromHash}`);
  console.log(`   To:   ${targetHash}`);
  console.log(`   Parallel requests: ${PARALLEL_FETCH_COUNT}`);
  console.log(`   Resuming: ${resuming} (${visited.size} blocks already visited)`);
  console.log("   Target: 100-200+ blocks/second");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  logEvent(`Background sync: ${fromHash.slice(0, 8)}... → ${targetHash.slice(0, 8)}...`, "info");
  setJoinStatus(resuming ? "Resuming parallel sync..." : "Starting parallel sync...");

  // Initialize state
  backgroundSync.isActive = true;
  backgroundSync.stopped = false;
  backgroundSync.blocksProcessed = initialBlocksProcessed;
  backgroundSync.startedAt = Date.now();
  backgroundSync.fromHash = fromHash;
  backgroundSync.targetHash = targetHash;
  backgroundSync.currentHash = fromHash;

  const pendingPayloads = [];
  const seen = dashboardState.processedTxIds;
  let reachedTarget = false;
  let noMoreData = false;
  let lastProgressSave = Date.now();
  let blocksThisSession = 0;

  // Queue of hashes to process
  let queue = [fromHash];

  try {
    const client = kaspaPortal.client;
    if (!client) {
      throw new Error("RPC client not available");
    }

    console.log("📡 RPC client ready, starting parallel backward DAG walk...");

    while (queue.length > 0) {
      // Check if user manually stopped
      if (backgroundSync.stopped) {
        console.log("🛑 Stopped by user - saving progress...");
        await saveSyncProgress(visited, backgroundSync.currentHash, targetHash, backgroundSync.blocksProcessed);
        break;
      }

      // Take up to PARALLEL_FETCH_COUNT hashes from queue (skip already visited)
      const batchHashes = [];
      while (batchHashes.length < PARALLEL_FETCH_COUNT && queue.length > 0) {
        const hash = queue.shift();
        if (!visited.has(hash)) {
          batchHashes.push(hash);
          visited.add(hash);
        }
      }

      if (batchHashes.length === 0) {
        continue;
      }

      // Check if target is in this batch
      if (batchHashes.includes(targetHash)) {
        reachedTarget = true;
        console.log("🎯 TARGET HASH IN BATCH - completing sync!");
      }

      // Fetch all blocks in parallel
      const results = await fetchBlocksParallel(client, batchHashes);

      // Process results
      for (const { hash, block, error } of results) {
        if (error) {
          const errMsg = error?.message || String(error);
          if (errMsg.includes("not found") || errMsg.includes("pruned") || errMsg.includes("doesn't exist")) {
            continue;
          }
          logger.debug("KKTP Sync: Block fetch error", { hash: hash.slice(0, 16), error: errMsg });
          continue;
        }

        if (!block) continue;

        backgroundSync.blocksProcessed++;
        blocksThisSession++;
        backgroundSync.currentHash = hash;

        // Check for KKTP payloads in transactions
        if (Array.isArray(block.transactions)) {
          for (const tx of block.transactions) {
            const txId = tx?.verboseData?.transactionId || tx?.id || "";
            if (txId && seen.has(txId)) continue;
            if (txId) seen.add(txId);

            const payloadHex = tx?.payload || "";
            if (!payloadHex) continue;

            const payload = decodeHexPayload(payloadHex);
            if (payload && payload.startsWith(KKTP_PREFIX)) {
              console.log(`📬 Found KKTP payload in block ${hash.slice(0, 8)}...`);
              pendingPayloads.push({
                payload,
                blockHash: hash,
                txId,
                timestamp: Number(block.header?.timestamp || Date.now()),
              });
            }
          }

          // Free WASM resources
          for (const tx of block.transactions) {
            if (typeof tx.free === "function") {
              try { tx.free(); } catch { /* ignore */ }
            }
          }
        }

        // Add parents to queue (going backward)
        const parentHashes = extractParentHashes(block);
        for (const parentHash of parentHashes) {
          if (!visited.has(parentHash)) {
            queue.push(parentHash);
          }
        }
      }

      // Stop if we reached target
      if (reachedTarget) {
        break;
      }

      // Progress logging every 500 blocks
      if (blocksThisSession % 500 === 0 && blocksThisSession > 0) {
        const elapsed = (Date.now() - backgroundSync.startedAt) / 1000;
        const rate = Math.round(blocksThisSession / elapsed);
        console.log(`📊 Progress: ${backgroundSync.blocksProcessed} blocks | ${Math.round(elapsed)}s | ${rate} blk/s | queue: ${queue.length} | payloads: ${pendingPayloads.length}`);
        setJoinStatus(`Syncing: ${backgroundSync.blocksProcessed} blocks (${rate}/s)...`);

        if (typeof onProgress === "function") {
          onProgress({
            blocksProcessed: backgroundSync.blocksProcessed,
            elapsedMs: Date.now() - backgroundSync.startedAt,
            currentHash: backgroundSync.currentHash,
            rate,
          });
        }
      }

      // Save progress to IndexedDB periodically
      const now = Date.now();
      if (blocksThisSession % PROGRESS_SAVE_INTERVAL === 0 || now - lastProgressSave > 30000) {
        await saveSyncProgress(visited, backgroundSync.currentHash, targetHash, backgroundSync.blocksProcessed);
        lastProgressSave = now;
      }
    }

    // Check if we exhausted the queue without finding target
    if (!reachedTarget && !backgroundSync.stopped && queue.length === 0) {
      noMoreData = true;
      console.log("📭 Queue empty - no more blocks to process (hit genesis or pruned data)");
    }

    // Process collected payloads (REVERSE order - oldest first)
    pendingPayloads.reverse();

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📨 PROCESSING COLLECTED PAYLOADS");
    console.log(`   Total payloads: ${pendingPayloads.length}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    for (const item of pendingPayloads) {
      try {
        const event = await kaspaPortal.processIncomingPayload(item.payload);
        if (event && typeof handleIncomingEvent === "function") {
          event._receivedAt = item.timestamp;
          event._blockHash = item.blockHash;
          event._isBackgroundSync = true;
          handleIncomingEvent(event);
        }
      } catch (err) {
        logger.warn("KKTP Sync: Payload processing error", { error: err.message });
      }
    }

    // Clear progress on successful completion
    if (reachedTarget || noMoreData) {
      await clearSyncProgress();
    }

    // Report final status
    const elapsed = Math.round((Date.now() - backgroundSync.startedAt) / 1000);
    const rate = elapsed > 0 ? Math.round(blocksThisSession / elapsed) : 0;
    const status = backgroundSync.stopped
      ? "stopped"
      : reachedTarget
        ? "complete"
        : noMoreData
          ? "exhausted"
          : "unknown";

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`✅ PARALLEL SYNC ${status.toUpperCase()}`);
    console.log(`   Blocks processed (total): ${backgroundSync.blocksProcessed}`);
    console.log(`   Blocks this session: ${blocksThisSession}`);
    console.log(`   Payloads found: ${pendingPayloads.length}`);
    console.log(`   Time elapsed: ${elapsed}s`);
    console.log(`   Average rate: ${rate} blocks/second`);
    console.log(`   Reached target: ${reachedTarget}`);
    console.log(`   No more data: ${noMoreData}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const statusEmoji = status === "complete" ? "✅" : status === "exhausted" ? "📭" : status === "stopped" ? "⏹️" : "ℹ️";
    const statusMsg = `Sync ${status}: ${backgroundSync.blocksProcessed} blocks, ${pendingPayloads.length} payloads, ${rate} blk/s`;

    logEvent(statusMsg, reachedTarget ? "success" : "info");
    setJoinStatus(`${statusEmoji} ${statusMsg}`);

    scheduleSessionSave?.();

  } catch (err) {
    // Save progress on error so we can resume
    await saveSyncProgress(visited, backgroundSync.currentHash, targetHash, backgroundSync.blocksProcessed);
    logger.error("KKTP Sync: Background sync error", { error: err.message });
    logEvent(`Background sync error: ${err.message}`, "error");
    setJoinStatus(`Sync error: ${err.message}`);
  } finally {
    backgroundSync.isActive = false;
    backgroundSync.stopped = false;
  }
}

// ─────────────────────────────────────────────────────────────
// Session Recovery on Load
// ─────────────────────────────────────────────────────────────

export async function recoverSessionsOnLoad({
  storageKeyPrefix,
  networkId,
  walletAddress,
  handleIncomingEvent,
  refreshSessionList,
  scheduleSessionSave,
} = {}) {
  backgroundSync.handleIncomingEvent = handleIncomingEvent;
  backgroundSync.scheduleSessionSave = scheduleSessionSave;

  logEvent("Restoring saved sessions...", "info");
  await restoreSavedSessions({ networkId, walletAddress, scheduleSessionSave });

  const sessionCount = kaspaPortal.getSessions().length;
  if (sessionCount > 0) {
    logEvent(`Restored ${sessionCount} session(s) from snapshot`, "success");
  }

  refreshSessionList?.();

  const { hash: targetHash, source: hashSource } = getBestStartHash();
  if (targetHash) {
    // Check if we have saved progress to resume
    const savedProgress = await loadSyncProgress();
    if (savedProgress && savedProgress.targetHash === targetHash) {
      logEvent(`Resume available: ${savedProgress.blocksProcessed} blocks already processed`, "info");
      setJoinStatus(`Resume available (${savedProgress.blocksProcessed} blocks processed)`);
    } else {
      logEvent(`Ready for background sync (target: ${hashSource})`, "info");
      setJoinStatus("Waiting for live block to start background sync...");
    }
  } else {
    logEvent("Fresh start - no background sync needed", "info");
    setJoinStatus("Ready");
  }
}

// ─────────────────────────────────────────────────────────────
// Join via Block Hash - Search single block for KKTP payloads
// ─────────────────────────────────────────────────────────────

/**
 * Search a single block for KKTP payloads (peer/lobby discoveries).
 * Used when a user pastes a block hash shared by someone else.
 *
 * @param {string} blockHash - 64-char hex block hash
 * @param {Object} options - Optional callbacks
 * @param {Function} options.handleIncomingEvent - Handler for discovered payloads (receives proper event object)
 * @returns {Promise<{found: number, payloads: string[]}>}
 */
export async function searchBlockForKKTP(blockHash, { handleIncomingEvent } = {}) {
  if (!blockHash || blockHash.length !== 64) {
    throw new Error("Invalid block hash - must be 64 hex characters");
  }

  const blockData = await kaspaPortal.fetchBlockByHash(blockHash);
  if (!blockData) {
    throw new Error("Block not found");
  }

  const foundPayloads = [];

  // Extract KKTP payloads from transaction payloads (not outputs)
  // The Kaspa WASM SDK returns: { block: { transactions: [{ payload: "hexstring" }] } }
  const block = blockData.block || blockData;
  const transactions = block.transactions || [];

  logger.debug("KKTP Sync: Searching block for payloads", {
    blockHash: blockHash.slice(0, 16),
    txCount: transactions.length,
  });

  for (const tx of transactions) {
    // tx.payload is a hex-encoded string directly on the transaction
    const payloadHex = tx.payload;
    if (!payloadHex) continue;

    // Decode hex to UTF-8 string
    const decoded = decodeHexPayload(payloadHex);
    if (decoded && decoded.startsWith(KKTP_PREFIX)) {
      foundPayloads.push(decoded);
      logger.debug("KKTP Sync: Found KKTP payload", {
        txId: tx.verboseData?.transactionId || tx.id || "unknown",
        preview: decoded.slice(0, 50),
      });
    }
  }

  // Process discovered payloads through kaspaPortal to get proper event objects
  for (const payload of foundPayloads) {
    try {
      // Use kaspaPortal.processIncomingPayload to get a proper event object
      // This returns { type: "discovery", anchor: {...} } for discovery anchors
      const event = await kaspaPortal.processIncomingPayload(payload);

      if (event && typeof handleIncomingEvent === "function") {
        // Pass the proper event object to the handler
        handleIncomingEvent(event);
      }
    } catch (err) {
      logger.warn("KKTP Sync: Failed to process payload", {
        payloadPreview: payload.slice(0, 50),
        error: err.message
      });
    }
  }

  return { found: foundPayloads.length, payloads: foundPayloads };
}

/**
 * Handle the "Join via Block Hash" button click.
 * Reads hash from input, searches block, reports results.
 *
 * @param {Object} options - Callbacks
 * @param {Function} options.handleIncomingEvent - Handler for discovered payloads
 */
export async function handleJoinViaBlockHash({ handleIncomingEvent } = {}) {
  if (!kaspaPortal.isReady) {
    logEvent("Not connected. Connect first.", "error");
    setJoinStatus("Not connected");
    return;
  }

  const blockHash = elements.joinBlockHashInput?.value?.trim() || "";

  if (!blockHash) {
    setJoinStatus("Enter a block hash to search");
    return;
  }

  if (blockHash.length !== 64 || !/^[a-fA-F0-9]+$/.test(blockHash)) {
    setJoinStatus("Invalid hash - must be 64 hex characters");
    logEvent("Invalid block hash format", "error");
    return;
  }

  // Disable button during search
  if (elements.btnJoinViaHash) elements.btnJoinViaHash.disabled = true;
  setJoinStatus("Searching block...");

  try {
    const result = await searchBlockForKKTP(blockHash, { handleIncomingEvent });

    if (result.found > 0) {
      logEvent(`Found ${result.found} KKTP payload(s) in block ${blockHash.slice(0, 8)}...`, "success");
      setJoinStatus(`✅ Found ${result.found} payload(s)`);
    } else {
      logEvent(`No KKTP payloads in block ${blockHash.slice(0, 8)}...`, "info");
      setJoinStatus("No KKTP payloads found in this block");
    }
  } catch (err) {
    logger.error("KKTP Sync: Join via block hash failed", { error: err.message });
    logEvent(`Search failed: ${err.message}`, "error");
    setJoinStatus(`❌ ${err.message}`);
  } finally {
    if (elements.btnJoinViaHash) elements.btnJoinViaHash.disabled = false;
  }
}
