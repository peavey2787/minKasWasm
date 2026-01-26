// main.js - Dashboard initialization and event handlers
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
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

    const payload = matchObj?.decodedPayload;
    if (!payload) continue;

    try {
      await processKKTPPayload(payload);
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
  kaspaPortal.closeSession(mailboxId);

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
