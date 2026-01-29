// main.js - Dashboard initialization and event handlers
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
import {
  dashboardState,
  setConnected,
  setActiveSession,
  removeDiscoveredPeer,
} from "./state.js";
import { elements } from "./dom.js";
import { saveSessionSnapshot } from "./storage.js";
import { recoverSessionsOnLoad, handleFetchMissed } from "./sync.js";
import { handleIncomingMatch, handleIncomingEvent } from "./events.js";
import { buildAnchorPayload } from "../../kktp/smHelpers.js";
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
  setMissedStatus,
  showFullWalletAddress,
} from "./ui.js";

// Constants
const NETWORK_ID = "testnet-10";
const KKTP_PREFIX = "KKTP:";

let saveTimer = null;
function scheduleSessionSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const snapshot = kaspaPortal.exportSessions();
    void saveSessionSnapshot({
      networkId: NETWORK_ID,
      walletAddress: dashboardState.walletAddress,
      snapshot,
    });
  }, 250);
}

function flushLocalState() {
  try {
    kaspaPortal.forcePersistAllSessions();
  } catch {
    // no-op
  }
  try {
    const snapshot = kaspaPortal.exportSessions();
    void saveSessionSnapshot({
      networkId: NETWORK_ID,
      walletAddress: dashboardState.walletAddress,
      snapshot,
    });
  } catch {
    // no-op
  }
}

function getEventDeps() {
  return {
    selectSession,
    refreshSessionList,
    getSession,
    handleConnectToPeer,
    scheduleSessionSave,
  };
}

/**
 * Initialize the dashboard
 */
async function init() {
  logEvent("Initializing KKTP Dashboard...", "info");

  try {
    // Initialize WASM
    logEvent("WASM init start...", "info");
    await kaspaPortal.init();
    logEvent("WASM initialized", "success");

    // Connect to Kaspa network
    logEvent("Connecting to Kaspa network...", "info");
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

    // Setup event listeners
    setupEventListeners();

    // Create wallet
    logEvent("Opening wallet...", "info");
    await kaspaPortal.createOrOpenWallet({
      password: "kktp-dashboard-wallet",
      walletFilename: "kktp-dashboard-wallet111",
    });

    dashboardState.walletAddress = kaspaPortal.identity.address;
    updateWalletAddress(dashboardState.walletAddress);

    setCopyStatus("Copy", false);

    logEvent("Wallet initialized", "success");

    const resumePrefix = `kktp_resume_${NETWORK_ID}_${dashboardState.walletAddress}_`;
    logEvent("Configuring resume persistence...", "info");
    kaspaPortal.configureResumePersistence({
      storageKeyPrefix: resumePrefix,
      includeMessages: true,
      throttleMs: 250,
    });

    updateBroadcastStatus("Syncing history...", "pending");
    elements.btnBroadcast.disabled = true;

    logEvent("Recovering sessions on load...", "info");
    await recoverSessionsOnLoad({
      storageKeyPrefix: resumePrefix,
      networkId: NETWORK_ID,
      walletAddress: dashboardState.walletAddress,
      handleIncomingEvent: (event) =>
        handleIncomingEvent(event, getEventDeps()),
      refreshSessionList,
      scheduleSessionSave,
    });
    logEvent("Recover sessions complete", "success");
    refreshSessionList();

    // Start scanning
    logEvent("Starting scanner pipeline...", "info");
    await startScanning();

    // Enable UI
    elements.btnBroadcast.disabled = false;
    updateBroadcastStatus("Ready to broadcast", "idle");
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
  elements.btnFetchMissed?.addEventListener("click", () =>
    handleFetchMissed({
      handleIncomingEvent: (event) =>
        handleIncomingEvent(event, getEventDeps()),
      scheduleSessionSave,
    }),
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushLocalState();
    }
  });
}

async function handleCopyAddress() {
  const address = dashboardState.walletAddress;
  if (!address) return;

  try {
    showFullWalletAddress(address);
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

    setCopyStatus("Copied!", false);
    setTimeout(() => setCopyStatus("Copy", false), 1200);
  } catch (err) {
    showFullWalletAddress(address);
    setCopyStatus("Copy manually", false);
    logEvent(`Copy failed: ${err.message}`, "error");
  }
}

/**
 * Start scanning for KKTP messages
 */
async function startScanning() {
  logEvent("Starting DAG scanner...", "info");
  dashboardState.isScanning = true;
  updateScannerStatus("syncing");

  kaspaPortal.setPrefixes([KKTP_PREFIX]);

  // Listen for matching transactions (already filtered)
  const eventDeps = getEventDeps();
  kaspaPortal.onNewTransactionMatch((match) =>
    handleIncomingMatch(match, eventDeps),
  );

  logEvent("Scanner subscribed to match events", "info");

  await kaspaPortal.startScanner();
  updateScannerStatus("ready");
  logEvent("Scanner started", "success");
}

/**
 * Process a KKTP payload via kaspaPortal
 */
async function processKKTPPayload(rawPayload) {
  try {
    const event = await kaspaPortal.processIncomingPayload(rawPayload);
    if (!event) return;
    handleIncomingEvent(event, getEventDeps());
  } catch (err) {
    logEvent(`Error processing payload: ${err.message}`, "error");
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
async function handleCloseSession() {
  if (!dashboardState.activeSessionId) return;

  const mailboxId = dashboardState.activeSessionId;
  if (dashboardState.closingSessions.has(mailboxId)) {
    logEvent("Session close already in progress.", "info");
    return;
  }

  const session = getSession(mailboxId);
  if (!session?.protocol?.createEndAnchor) {
    logEvent("Unable to close: session protocol unavailable.", "error");
    return;
  }

  dashboardState.closingSessions.add(mailboxId);
  setChatEnabled(false);
  refreshSessionList();

  try {
    logEvent("Broadcasting session_end anchor...", "info");
    const endAnchor = await session.protocol.createEndAnchor("user_closed");
    const payload = buildAnchorPayload(endAnchor);
    const address =
      dashboardState.walletAddress || kaspaPortal.identity.address;

    await kaspaPortal.send({
      toAddress: address,
      amount: "1",
      payload,
    });

    logEvent(
      `Session close broadcast for ${mailboxId.substring(0, 8)}...`,
      "success",
    );
    scheduleSessionSave();
  } catch (err) {
    dashboardState.closingSessions.delete(mailboxId);
    setChatEnabled(true);
    logEvent(`Session close failed: ${err.message}`, "error");
  }
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
