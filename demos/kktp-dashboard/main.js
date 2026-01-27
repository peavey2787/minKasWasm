// main.js - Dashboard initialization and event handlers
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
import { hexToString } from "../../wrapper/utilities/utilities.js";
import {
  dashboardState,
  setConnected,
  setActiveSession,
  addDiscoveredPeer,
  removeDiscoveredPeer,
} from "./state.js";
import { elements } from "./dom.js";
import {
  logEvent,
  updateConnectionStatus,
  updateScannerStatus,
  updateIdentityDisplay,
  updateWalletAddress,
  updateWalletBalance,
  setCopyStatus,
  updateBroadcastStatus,
  renderPeerList,
  renderSessionList,
  renderChatMessages,
  setChatEnabled,
  clearMessageInput,
} from "./ui.js";

// Constants
const NETWORK_ID = "testnet-10";
const KKTP_PREFIX = "KKTP:";
const LAST_DISCOVERY_BLOCK_KEY = "kktp:lastDiscoveryBlockHash";
const SESSION_STORAGE_KEY = "kktp:sessions";

let dashboardDbPromise = null;
function openDashboardDb() {
  if (dashboardDbPromise) return dashboardDbPromise;

  dashboardDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("KKTP_DB", 2);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("dashboard_snapshots")) {
        const store = db.createObjectStore("dashboard_snapshots", {
          keyPath: "id",
        });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dashboardDbPromise;
}

function getStoredDiscoveryBlockHash() {
  return (localStorage.getItem(LAST_DISCOVERY_BLOCK_KEY) || "").trim();
}

function setStoredDiscoveryBlockHash(hash) {
  if (!hash) return;
  localStorage.setItem(LAST_DISCOVERY_BLOCK_KEY, hash);
}

function getSessionStorageKeyForAddress(address) {
  const addrRaw = address ?? "unknown";
  const addr = String(addrRaw).toLowerCase();
  return `${SESSION_STORAGE_KEY}:${NETWORK_ID}:${addr}`;
}

function getSessionStorageKey() {
  return getSessionStorageKeyForAddress(dashboardState.walletAddress);
}

async function loadSessionSnapshot() {
  if (typeof indexedDB === "undefined") return null;

  const key = getSessionStorageKey();
  const fallbackKey = getSessionStorageKeyForAddress("unknown");

  try {
    const db = await openDashboardDb();
    const snap = await new Promise((resolve, reject) => {
      const tx = db.transaction("dashboard_snapshots", "readonly");
      const store = tx.objectStore("dashboard_snapshots");
      const req = store.get(key);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (snap?.data) {
      return JSON.parse(snap.data);
    }
  } catch {
    // ignore
  }

  if (!dashboardState.walletAddress) return null;

  try {
    const db = await openDashboardDb();
    const legacy = await new Promise((resolve, reject) => {
      const tx = db.transaction("dashboard_snapshots", "readonly");
      const store = tx.objectStore("dashboard_snapshots");
      const req = store.get(fallbackKey);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (legacy?.data) {
      const parsed = JSON.parse(legacy.data);
      await saveSessionSnapshot(parsed);
      return parsed;
    }
  } catch {
    // ignore
  }

  return null;
}

async function saveSessionSnapshot(overrideSnapshot = null) {
  if (typeof indexedDB === "undefined") return;

  try {
    const snap = overrideSnapshot || kaspaPortal.exportSessions();
    const key = dashboardState.walletAddress
      ? getSessionStorageKey()
      : getSessionStorageKeyForAddress("unknown");
    const db = await openDashboardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("dashboard_snapshots", "readwrite");
      const store = tx.objectStore("dashboard_snapshots");
      store.put({
        id: key,
        savedAt: Date.now(),
        data: JSON.stringify(snap),
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // no-op
  }
}

let saveTimer = null;
function scheduleSessionSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveSessionSnapshot(), 250);
}

async function restoreSavedSessions() {
  const snap = await loadSessionSnapshot();
  if (!snap) return;
  await kaspaPortal.restoreSessions(snap, { skipExpired: true });
  kaspaPortal.pruneExpiredSessions();
  scheduleSessionSave();
}

function setMissedStatus(text) {
  const el = elements.missedStatus;
  if (!el) return;
  el.textContent = text || "";
}

function decodeHexPayload(payloadHex) {
  try {
    if (!payloadHex) return "";
    return hexToString(payloadHex);
  } catch {
    return "";
  }
}

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

function maybeStoreOwnDiscoveryBlock(event, matchObj) {
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
 * Initialize the dashboard
 */
async function init() {
  logEvent("Initializing KKTP Dashboard...", "info");

  try {
    // Initialize WASM
    await kaspaPortal.init();
    logEvent("WASM initialized", "success");

    // Connect to Kaspa network
    await kaspaPortal.connect({
      networkId: NETWORK_ID,
      onBalanceChange: (balanceKas) => {
        dashboardState.walletBalance = balanceKas;
        updateWalletBalance(balanceKas);
      },
      startIntelligence: true,
      scannerOptions: {
        prefixes: [KKTP_PREFIX],
      },
    });

    setConnected(true);
    updateConnectionStatus(true, NETWORK_ID);
    logEvent(`Connected to ${NETWORK_ID}`, "success");

    // Create wallet
    await kaspaPortal.createOrOpenWallet({
      password: "kktp-dashboard-wallet",
      walletFilename: "kktp-dashboard-wallet111",
    });
    dashboardState.walletAddress = kaspaPortal.identity.address;
    updateWalletAddress(dashboardState.walletAddress);
    setCopyStatus("Copy", !dashboardState.walletAddress);
    logEvent("Wallet initialized", "success");

    kaspaPortal.configureResumePersistence({
      storageKeyPrefix: `kktp_resume_${NETWORK_ID}_${dashboardState.walletAddress}_`,
      includeMessages: true,
      throttleMs: 250,
    });

    await restoreSavedSessions();
    refreshSessionList();

    // Setup event listeners
    setupEventListeners();

    // Start scanning
    await startScanning();

    // Enable UI
    elements.btnBroadcast.disabled = false;
    logEvent("Dashboard ready!", "success");
  } catch (err) {
    logEvent(`Initialization failed: ${err.message}`, "error");
    console.error(err);
  }
}

/**
 * Setup UI event listeners
 */
function setupEventListeners() {
  // Broadcast discovery
  elements.btnBroadcast?.addEventListener("click", handleBroadcastDiscovery);

  // Send message
  elements.btnSend?.addEventListener("click", handleSendMessage);
  elements.messageInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Close session
  elements.btnCloseSession?.addEventListener("click", handleCloseSession);

  // Copy address
  elements.btnCopyAddress?.addEventListener("click", handleCopyAddress);

  // Config inputs
  elements.gameName?.addEventListener("change", (e) => {
    dashboardState.gameName = e.target.value || "KKTP Chat";
  });
  elements.uptimeSeconds?.addEventListener("change", (e) => {
    dashboardState.uptimeSeconds = parseInt(e.target.value) || 3600;
  });

  // Fetch missed messages
  elements.btnFetchMissed?.addEventListener("click", handleFetchMissed);
}

async function handleCopyAddress() {
  const address = dashboardState.walletAddress;
  if (!address) return;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(address);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = address;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopyStatus("Copied!", true);
    setTimeout(() => setCopyStatus("Copy", false), 1200);
  } catch (err) {
    setCopyStatus("Copy failed", false);
    logEvent(`Copy failed: ${err.message}`, "error");
  }
}

/**
 * Start scanning for KKTP messages
 */
async function startScanning() {
  logEvent("Starting DAG scanner...", "info");
  dashboardState.isScanning = true;
  updateScannerStatus(true);

  kaspaPortal.setPrefixes([KKTP_PREFIX]);

  // Listen for matching transactions (already filtered)
  kaspaPortal.onNewTransactionMatch(handleIncomingMatch);

  await kaspaPortal.startScanner();
  logEvent("Scanner started", "success");
}

/**
 * Handle incoming block from scanner
 */
async function handleIncomingMatch(matchObjOrArray) {
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
        handleIncomingEvent(event);
        maybeStoreOwnDiscoveryBlock(event, matchObj);
        scheduleSessionSave();
      }
    } catch (err) {
      logEvent(`Error processing payload: ${err.message}`, "error");
    }
  }
}

/**
 * Process a KKTP payload via kaspaPortal
 */
async function processKKTPPayload(rawPayload) {
  try {
    const event = await kaspaPortal.processIncomingPayload(rawPayload);
    if (!event) return;
    handleIncomingEvent(event);
  } catch (err) {
    logEvent(`Error processing payload: ${err.message}`, "error");
  }
}

/**
 * Handle incoming KKTP events from kaspaPortal
 */
function handleIncomingEvent(event) {
  switch (event.type) {
    case "discovery":
      if (!event.anchor || !event.anchor.pub_sig) {
        logEvent(
          "Received invalid discovery anchor (missing pub_sig)",
          "error",
        );
        return;
      }
      handleDiscoveryAnchor(event.anchor);
      break;
    case "session_established":
      logEvent(
        `Session established: ${event.mailboxId.substring(0, 8)}...`,
        "success",
      );
      removeDiscoveredPeer(event.response.sid);
      renderPeerList(handleConnectToPeer);
      refreshSessionList();
      if (!dashboardState.activeSessionId) {
        selectSession(event.mailboxId);
      }
      break;
    case "messages":
      if (event.messages?.length > 0) {
        logEvent(`Received ${event.messages.length} message(s)`, "info");
      }
      if (event.mailboxId === dashboardState.activeSessionId) {
        const session = getSession(event.mailboxId);
        renderChatMessages(session || null);
      }
      refreshSessionList();
      break;
    case "session_end":
      logEvent(`Session ended: ${event.reason}`, "info");
      if (
        event.mailboxId &&
        event.mailboxId === dashboardState.activeSessionId
      ) {
        dashboardState.activeSessionId = null;
        setChatEnabled(false);
        renderChatMessages(null);
      }
      refreshSessionList();
      break;
    case "response":
      logEvent("Received response anchor", "info");
      break;
    default:
      break;
  }

  scheduleSessionSave();
}

/**
 * Handle discovery anchor from peer
 */
function handleDiscoveryAnchor(discovery) {
  if (!discovery || !discovery.pub_sig) {
    logEvent("Malformed discovery anchor dropped", "error");
    return;
  }

  const isSelf =
    dashboardState.myPubSig && discovery.pub_sig === dashboardState.myPubSig;

  if (addDiscoveredPeer(discovery, { isSelf })) {
    const prefix = isSelf ? "(SELF) " : "";
    logEvent(
      `${prefix}Discovered peer: ${discovery.pub_sig.substring(0, 8)}...`,
      "info",
    );
    renderPeerList(handleConnectToPeer);
  }
}

/**
 * Handle broadcast discovery button
 */
async function handleBroadcastDiscovery() {
  try {
    updateBroadcastStatus("Creating anchor...", "pending");
    elements.btnBroadcast.disabled = true;

    const meta = {
      game: dashboardState.gameName,
      version: "1.0.0",
      upTime: dashboardState.uptimeSeconds,
    };

    updateBroadcastStatus("Broadcasting...", "pending");
    const { discovery } = await kaspaPortal.broadcastDiscovery(meta);

    // Store our identity
    dashboardState.myPubSig = discovery.pub_sig;
    dashboardState.broadcastedDiscovery = discovery;
    updateIdentityDisplay(discovery.pub_sig);

    updateBroadcastStatus("Broadcast sent!", "success");
    logEvent(
      `Discovery broadcast: ${discovery.sid.substring(0, 8)}...`,
      "success",
    );

    setMissedStatus("Waiting for discovery to be mined...");
    scheduleSessionSave();

    setTimeout(() => {
      elements.btnBroadcast.disabled = false;
      updateBroadcastStatus("Ready to broadcast", "idle");
    }, 5000);
  } catch (err) {
    updateBroadcastStatus(`Error: ${err.message}`, "error");
    elements.btnBroadcast.disabled = false;
    logEvent(`Broadcast failed: ${err.message}`, "error");
  }
}

async function handleFetchMissed() {
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
      if (event) {
        handleIncomingEvent(event);
        if (event.type === "discovery" && item.blockHash) {
          setStoredDiscoveryBlockHash(item.blockHash);
        }
        scheduleSessionSave();
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

/**
 * Handle connect to peer button
 */
async function handleConnectToPeer(discovery) {
  try {
    logEvent(
      `Connecting to peer ${discovery.pub_sig.substring(0, 8)}...`,
      "info",
    );

    const { response, mailboxId } = await kaspaPortal.connectToPeer(discovery);

    // Store our identity if not already set
    if (!dashboardState.myPubSig) {
      dashboardState.myPubSig = response.pub_sig_resp;
      updateIdentityDisplay(response.pub_sig_resp);
    }

    logEvent(
      `Response broadcast for session ${mailboxId.substring(0, 8)}...`,
      "success",
    );

    // Remove from discovered peers
    removeDiscoveredPeer(discovery.sid);
    renderPeerList(handleConnectToPeer);

    // Select the new session
    selectSession(mailboxId);
    scheduleSessionSave();
  } catch (err) {
    logEvent(`Connection failed: ${err.message}`, "error");
  }
}

/**
 * Handle send message
 */
async function handleSendMessage() {
  const input = elements.messageInput;
  const plaintext = input?.value?.trim();

  if (!plaintext || !dashboardState.activeSessionId) return;

  try {
    await kaspaPortal.sendMessage(dashboardState.activeSessionId, plaintext);

    clearMessageInput();

    logEvent("Message sent", "success");
    scheduleSessionSave();
  } catch (err) {
    logEvent(`Send failed: ${err.message}`, "error");
  }
}

/**
 * Handle close session
 */
function handleCloseSession() {
  if (!dashboardState.activeSessionId) return;

  const mailboxId = dashboardState.activeSessionId;
  if (!kaspaPortal.isSessionExpired(mailboxId)) {
    logEvent(
      "Session can only be closed by a valid session_end anchor or expiry.",
      "info",
    );
    return;
  }

  kaspaPortal.closeSession(mailboxId);
  scheduleSessionSave();

  dashboardState.activeSessionId = null;
  setChatEnabled(false);
  renderChatMessages(null);
  refreshSessionList();

  logEvent(`Session ${mailboxId.substring(0, 8)}... closed`, "info");
}

/**
 * Select a session
 */
function selectSession(mailboxId) {
  setActiveSession(mailboxId);

  const session = getSession(mailboxId);
  if (session) {
    setChatEnabled(true);
    renderChatMessages(session);
  }

  refreshSessionList();
}

/**
 * Refresh the session list UI
 */
function refreshSessionList() {
  const sessions = kaspaPortal.getSessions();
  renderSessionList(sessions, dashboardState.activeSessionId, selectSession);
}

function getSession(mailboxId) {
  return kaspaPortal.getSessions().find((s) => s.mailboxId === mailboxId);
}

// Initialize on load
document.addEventListener("DOMContentLoaded", init);
