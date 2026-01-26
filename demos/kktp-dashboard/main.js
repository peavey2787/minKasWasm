// main.js - Dashboard initialization and event handlers
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
import { SessionManager } from "./sessionManager.js";
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
  updateBroadcastStatus,
  renderPeerList,
  renderSessionList,
  renderChatMessages,
  setChatEnabled,
  clearMessageInput,
} from "./ui.js";
import {
  createDiscoveryAnchor,
  createResponseAnchor,
  serializeAnchorForBroadcast,
  parseKKTPPayload,
  validateAndRouteAnchor,
} from "./anchorHandler.js";

// Constants
const NETWORK_ID = "mainnet";
const KKTP_PREFIX = "KKTP:";

// Session Manager instance
let sessionManager = null;

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
      filename: "kktp-dashboard-wallet111",
    });
    logEvent("Wallet initialized", "success");

    // Initialize session manager
    sessionManager = new SessionManager(kaspaPortal);
    setupSessionManagerCallbacks();

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
 * Setup session manager callbacks
 */
function setupSessionManagerCallbacks() {
  sessionManager.onSessionUpdate = (mailboxId, event) => {
    logEvent(`Session ${mailboxId.substring(0, 8)}...: ${event}`, "info");
    refreshSessionList();

    if (event === "created" && !dashboardState.activeSessionId) {
      selectSession(mailboxId);
    }
  };

  sessionManager.onMessageReceived = (mailboxId, message) => {
    const direction = message.isOutbound ? "sent" : "received";
    logEvent(`Message ${direction} in ${mailboxId.substring(0, 8)}...`, "info");

    if (mailboxId === dashboardState.activeSessionId) {
      const session = sessionManager.getSession(mailboxId);
      renderChatMessages(session);
    }

    refreshSessionList();
  };
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

  // Config inputs
  elements.gameName?.addEventListener("change", (e) => {
    dashboardState.gameName = e.target.value || "KKTP Chat";
  });
  elements.uptimeSeconds?.addEventListener("change", (e) => {
    dashboardState.uptimeSeconds = parseInt(e.target.value) || 3600;
  });
}

/**
 * Start scanning for KKTP messages
 */
async function startScanning() {
  logEvent("Starting DAG scanner...", "info");
  dashboardState.isScanning = true;
  updateScannerStatus(true);

  kaspaPortal.setPrefixes([KKTP_PREFIX]);

  await kaspaPortal.startScanner(handleIncomingBlock);
  logEvent("Scanner started", "success");
}

/**
 * Handle incoming block from scanner
 */
async function handleIncomingBlock(blockData) {
  if (!blockData?.transactions) return;

  for (const tx of blockData.transactions) {
    const payload = tx.payload || tx.decodedPayload;
    if (!payload || !payload.startsWith(KKTP_PREFIX)) continue;

    try {
      await processKKTPPayload(payload);
    } catch (err) {
      logEvent(`Error processing payload: ${err.message}`, "error");
    }
  }
}

/**
 * Process a KKTP payload
 */
async function processKKTPPayload(rawPayload) {
  const parsed = parseKKTPPayload(rawPayload);
  if (!parsed) return;

  if (parsed.type === "anchor") {
    await handleAnchor(parsed.anchor);
  } else if (parsed.type === "message") {
    handleMessage(parsed.mailboxId, parsed.message);
  }
}

/**
 * Handle incoming anchor
 */
async function handleAnchor(anchor) {
  try {
    // Validate and verify signature
    await validateAndRouteAnchor(kaspaPortal, anchor);

    if (anchor.type === "discovery") {
      handleDiscoveryAnchor(anchor);
    } else if (anchor.type === "response") {
      await handleResponseAnchor(anchor);
    } else if (anchor.type === "session_end") {
      handleSessionEndAnchor(anchor);
    }
  } catch (err) {
    logEvent(`Invalid anchor: ${err.message}`, "error");
  }
}

/**
 * Handle discovery anchor from peer
 */
function handleDiscoveryAnchor(discovery) {
  // Don't add our own discovery
  if (dashboardState.myPubSig && discovery.pub_sig === dashboardState.myPubSig) {
    return;
  }

  if (addDiscoveredPeer(discovery)) {
    logEvent(`Discovered peer: ${discovery.pub_sig.substring(0, 8)}...`, "info");
    renderPeerList(handleConnectToPeer);
  }
}

/**
 * Handle response anchor (either for us or from us)
 */
async function handleResponseAnchor(response) {
  // Check if this is a response to our discovery
  const result = await sessionManager.handleIncomingResponse(response);
  if (result) {
    logEvent(`Session established: ${result.mailboxId.substring(0, 8)}...`, "success");
    removeDiscoveredPeer(response.sid);
    renderPeerList(handleConnectToPeer);
    return;
  }

  // Check if this response names us as the initiator (passive connection)
  if (dashboardState.myPubSig && response.initiator_pub_sig === dashboardState.myPubSig) {
    logEvent("Received response naming us as initiator", "info");
    // This would require storing our discovery anchor to complete the handshake
  }
}

/**
 * Handle session end anchor
 */
function handleSessionEndAnchor(anchor) {
  // Find session by sid
  const sessions = sessionManager.getAllSessions();
  const session = sessions.find((s) => s.discovery?.sid === anchor.sid);

  if (session) {
    // Verify the anchor is from a valid participant
    const isFromPeer = anchor.pub_sig === session.peerPubSig;
    const isFromMe = anchor.pub_sig === dashboardState.myPubSig;

    if (isFromPeer || isFromMe) {
      logEvent(`Session ended: ${anchor.reason}`, "info");
      sessionManager.closeSession(session.mailboxId);
      refreshSessionList();
    }
  }
}

/**
 * Handle incoming message
 */
function handleMessage(mailboxId, msgObject) {
  if (msgObject.type !== "msg") {
    logEvent("Protocol violation: non-msg type in mailbox path", "error");
    return;
  }

  const plaintexts = sessionManager.routeIncomingMessage(mailboxId, msgObject);
  if (plaintexts && plaintexts.length > 0) {
    logEvent(`Received ${plaintexts.length} message(s)`, "info");
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

    const { discovery, keys, dhPrivateKey } = await createDiscoveryAnchor(kaspaPortal, meta);

    // Store our identity
    dashboardState.myKeys = keys;
    dashboardState.myPubSig = keys.sig.publicKey;
    dashboardState.broadcastedDiscovery = discovery;
    sessionManager.setMyIdentity(keys.sig.publicKey);
    updateIdentityDisplay(keys.sig.publicKey);

    // Register pending discovery
    sessionManager.registerPendingDiscovery(discovery, dhPrivateKey);

    // Broadcast to Kaspa
    const payload = serializeAnchorForBroadcast(discovery);
    updateBroadcastStatus("Broadcasting...", "pending");

    await kaspaPortal.send({
      toAddress: await kaspaPortal.identity.getReceiveAddress(),
      amount: "0.001",
      payload,
    });

    updateBroadcastStatus("Broadcast sent!", "success");
    logEvent(`Discovery broadcast: ${discovery.sid.substring(0, 8)}...`, "success");

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
    logEvent(`Connecting to peer ${discovery.pub_sig.substring(0, 8)}...`, "info");

    // Create response anchor
    const { response, keys, dhPrivateKey } = await createResponseAnchor(kaspaPortal, discovery);

    // Store our identity if not already set
    if (!dashboardState.myPubSig) {
      dashboardState.myKeys = keys;
      dashboardState.myPubSig = keys.sig.publicKey;
      sessionManager.setMyIdentity(keys.sig.publicKey);
      updateIdentityDisplay(keys.sig.publicKey);
    }

    // Create session as responder
    const { mailboxId } = await sessionManager.createSessionAsResponder(
      discovery,
      response,
      dhPrivateKey,
    );

    // Broadcast response
    const payload = serializeAnchorForBroadcast(response);
    await kaspaPortal.send({
      toAddress: await kaspaPortal.identity.getReceiveAddress(),
      amount: "0.001",
      payload,
    });

    logEvent(`Response broadcast for session ${mailboxId.substring(0, 8)}...`, "success");

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
    const { payload, messageId } = sessionManager.sendMessage(
      dashboardState.activeSessionId,
      plaintext,
    );

    clearMessageInput();

    // Broadcast to Kaspa
    await kaspaPortal.send({
      toAddress: await kaspaPortal.identity.getReceiveAddress(),
      amount: "0.001",
      payload,
    });

    // Mark as confirmed (in real implementation, wait for DAG confirmation)
    sessionManager.confirmMessage(dashboardState.activeSessionId, messageId);

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
  sessionManager.closeSession(mailboxId);

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

  const session = sessionManager.getSession(mailboxId);
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
  const sessions = sessionManager.getAllSessions();
  renderSessionList(sessions, dashboardState.activeSessionId, selectSession);
}

// Initialize on load
document.addEventListener("DOMContentLoaded", init);
