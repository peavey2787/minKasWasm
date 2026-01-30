// main.js - Dashboard initialization and event handlers
import { kaspaPortal } from "../../wrapper/kaspaPortal.js";
import {
  dashboardState,
  setConnected,
  setActiveSession,
  removeDiscoveredPeer,
  setLobbyMode,
  setActiveLobby,
  clearActiveLobby,
} from "./state.js";
import { elements } from "./dom.js";
import { saveSessionSnapshot, getStoredDiscoveryBlockHash } from "./storage.js";
import { recoverSessionsOnLoad, handleFetchMissed, stopDagWalk, isDagWalkActive, getDagWalkProgress } from "./sync.js";
import { handleIncomingMatch, handleIncomingEvent } from "./events.js";
import { buildAnchorPayload } from "../../kktp/protocol/sessions/index.js";
import { LobbyManager, LOBBY_STATES } from "../../kktp/lobby/index.js";
import { logger, setDebugLogging } from "./logger.js";
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
  renderDiscoveredLobbies,
  renderSessionList,
  renderChatMessages,
  setChatEnabled,
  clearMessageInput,
  setMissedStatus,
  showFullWalletAddress,
  renderLobbyMembers,
  renderLobbyChatMessages,
  updateLobbyStatus,
  updateLobbyControlsVisibility,
  setLobbyModeChecked,
  getLobbyNameInput,
} from "./ui.js";

// Constants
const NETWORK_ID = "testnet-10";
const KKTP_PREFIX = "KKTP:";

// Optional debug controls for production (localStorage + query params supported)
window.KKTP_DEBUG = {
  enable: (level = "debug") => setDebugLogging(true, level),
  disable: () => setDebugLogging(false),
  setLevel: (level) => setDebugLogging(true, level),
  logger,
};

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
    handleJoinLobby,
    scheduleSessionSave,
  };
}

// Lobby manager instance
let lobbyManager = null;

/**
 * Initialize the lobby manager
 */
function initLobbyManager() {
  lobbyManager = new LobbyManager(kaspaPortal.sessionManager, {
    maxMembers: 16,
    keyRotationMs: 10 * 60 * 1000, // 10 minutes
    autoAcceptJoins: true, // Set to false for manual approval workflow
  });

  // Set up lobby event handlers
  lobbyManager.onMemberJoin((member) => {
    logEvent(`Lobby: ${member.displayName} joined`, "success");
    renderLobbyMembers(lobbyManager.members, lobbyManager.isHost);
    updateLobbyStatus(lobbyManager.lobbyInfo);
  });

  lobbyManager.onMemberLeave((pubSig, reason) => {
    logEvent(`Lobby: Member left (${reason})`, "info");
    renderLobbyMembers(lobbyManager.members, lobbyManager.isHost);
    updateLobbyStatus(lobbyManager.lobbyInfo);
  });

  lobbyManager.onGroupMessage((msg) => {
    logEvent(`Lobby msg from ${msg.senderName || msg.senderPubSig.slice(0, 8)}`, "info");
    renderLobbyChatMessages(lobbyManager.messageHistory, dashboardState.myPubSig);
  });

  lobbyManager.onKeyRotation((version) => {
    logEvent(`Lobby: Key rotated to v${version}`, "info");
    updateLobbyStatus(lobbyManager.lobbyInfo);
  });

  lobbyManager.onLobbyClose((reason) => {
    logEvent(`Lobby closed: ${reason}`, "info");
    clearActiveLobby();
    updateLobbyStatus(null);
    updateLobbyControlsVisibility(false, false);
    hideDiscoveryBlockHash();
    renderPeerList(handleConnectToPeer);
    renderDiscoveredLobbies(handleJoinLobby);
  });

  lobbyManager.onStateChange((newState, oldState) => {
    logger.debug(`Lobby state: ${oldState} → ${newState}`);

    // When we become a member or host, switch UI to lobby mode
    if (newState === LOBBY_STATES.MEMBER || newState === LOBBY_STATES.HOSTING) {
      // Set lobby mode active
      setLobbyMode(true);
      setActiveLobby(lobbyManager.lobbyInfo);

      // Mark that lobby is selected for chat (not a 1:1 session)
      dashboardState.activeLobbySelected = true;

      // Update UI to show lobby controls
      updateLobbyStatus(lobbyManager.lobbyInfo);
      updateLobbyControlsVisibility(true, newState === LOBBY_STATES.HOSTING);
      renderLobbyMembers(lobbyManager.members, newState === LOBBY_STATES.HOSTING);

      // Show lobby status and member section
      if (elements.lobbyStatus) {
        elements.lobbyStatus.style.display = "block";
      }
      if (elements.lobbyMemberSection) {
        elements.lobbyMemberSection.style.display = "block";
      }

      // Update chat to show lobby messages
      setChatEnabled(true);
      renderLobbyChatMessages(lobbyManager.messageHistory, dashboardState.myPubSig);

      // Update checkbox state
      setLobbyModeChecked(true);

      // Refresh session list to show lobby as selected
      refreshSessionList();

      logEvent(`Lobby ${newState === LOBBY_STATES.HOSTING ? "hosted" : "joined"} successfully`, "success");
    }

    // When lobby is closed or we leave, switch back to 1:1 mode
    if (newState === LOBBY_STATES.IDLE || newState === LOBBY_STATES.CLOSED) {
      if (oldState === LOBBY_STATES.MEMBER || oldState === LOBBY_STATES.HOSTING) {
        setLobbyMode(false);
        clearActiveLobby();
        dashboardState.activeLobbySelected = false;

        // Reset checkbox
        setLobbyModeChecked(false);
        if (elements.lobbyNameGroup) {
          elements.lobbyNameGroup.style.display = "none";
        }

        refreshSessionList();
      }
    }
  });

  // Handle join requests when autoAcceptJoins is false
  lobbyManager.onJoinRequest((request, acceptFn, rejectFn) => {
    const displayName = request.displayName || request.pubSig?.slice(0, 8) + "...";
    logEvent(`Lobby: Join request from ${displayName}`, "info");

    // For production: implement a confirmation dialog here
    // Example: showJoinRequestModal(request, acceptFn, rejectFn);
    // For now with autoAcceptJoins=true, this won't be called
    acceptFn();
  });

  dashboardState.lobbyManager = lobbyManager;
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

    // Initialize lobby manager
    initLobbyManager();
    logEvent("Lobby manager initialized", "success");

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
  elements.btnFetchMissed?.addEventListener("click", () => {
    updateDagWalkButtons(true);
    handleFetchMissed({
      handleIncomingEvent: (event) =>
        handleIncomingEvent(event, getEventDeps()),
      scheduleSessionSave,
      onProgress: (progress) => {
        updateDagWalkProgress(progress);
      },
    }).finally(() => {
      updateDagWalkButtons(false);
    });
  });

  // Stop DAG walk button
  elements.btnStopDagWalk?.addEventListener("click", () => {
    if (stopDagWalk()) {
      logEvent("DAG walk stop requested", "info");
    }
  });

  // Copy discovery block hash
  elements.btnCopyDiscoveryHash?.addEventListener("click", handleCopyDiscoveryHash);

  // Lobby mode checkbox
  elements.lobbyModeCheckbox?.addEventListener("change", (e) => {
    const isLobbyMode = e.target.checked;
    setLobbyMode(isLobbyMode);

    // Show/hide lobby name input
    const lobbyNameGroup = elements.lobbyNameGroup;
    if (lobbyNameGroup) {
      lobbyNameGroup.style.display = isLobbyMode ? "block" : "none";
    }

    // Update button text
    if (elements.btnBroadcast) {
      elements.btnBroadcast.textContent = isLobbyMode
        ? "Host Lobby"
        : "Broadcast Discovery";
    }
  });

  // Leave lobby button
  elements.btnLeaveLobby?.addEventListener("click", handleLeaveLobby);

  // Close lobby button
  elements.btnCloseLobby?.addEventListener("click", handleCloseLobby);

  // Kick member buttons (delegated)
  elements.lobbyMemberList?.addEventListener("click", async (e) => {
    if (e.target.classList.contains("btn-kick")) {
      const pubSig = e.target.dataset.pubsig;
      if (pubSig && lobbyManager?.isHost) {
        try {
          await lobbyManager.kickMember(pubSig, "Kicked by host");
          logEvent("Member kicked", "success");
        } catch (err) {
          logEvent(`Kick failed: ${err.message}`, "error");
        }
      }
    }
  });

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
 * Copy discovery block hash to clipboard for sharing with peers
 */
async function handleCopyDiscoveryHash() {
  const hash = elements.discoveryBlockHashDisplay?.value || "";
  if (!hash) return;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(hash);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = hash;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    const btn = elements.btnCopyDiscoveryHash;
    if (btn) {
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 1200);
    }
    logEvent("Discovery block hash copied to clipboard", "success");
  } catch (err) {
    logEvent(`Copy failed: ${err.message}`, "error");
  }
}

/**
 * Update DAG walk button visibility based on walk state
 * @param {boolean} isWalking - Whether a DAG walk is in progress
 */
function updateDagWalkButtons(isWalking) {
  const btnFetch = elements.btnFetchMissed;
  const btnStop = elements.btnStopDagWalk;
  const progress = elements.dagWalkProgress;

  if (btnFetch) {
    btnFetch.disabled = isWalking;
  }
  if (btnStop) {
    btnStop.style.display = isWalking ? "inline-block" : "none";
  }
  if (progress) {
    progress.style.display = isWalking ? "block" : "none";
    if (!isWalking) {
      progress.textContent = "";
    }
  }
}

/**
 * Update DAG walk progress display
 * @param {{ blocksProcessed: number, elapsedMs: number, lastBlockHash: string }} progress
 */
function updateDagWalkProgress(progress) {
  const el = elements.dagWalkProgress;
  if (!el) return;

  const elapsed = Math.round(progress.elapsedMs / 1000);
  const hashShort = progress.lastBlockHash ? progress.lastBlockHash.slice(0, 8) + "..." : "—";
  el.textContent = `Blocks: ${progress.blocksProcessed} | Time: ${elapsed}s | Last: ${hashShort}`;
}

/**
 * Show discovery block hash section for hosts to share with peers
 * @param {string} blockHash - The discovery block hash to display
 */
function showDiscoveryBlockHash(blockHash) {
  const section = elements.discoveryBlockHashSection;
  const display = elements.discoveryBlockHashDisplay;

  if (section && display && blockHash) {
    display.value = blockHash;
    section.style.display = "block";
    logEvent(`Discovery block hash: ${blockHash.slice(0, 12)}...`, "info");
  }
}

/**
 * Hide the discovery block hash section
 */
function hideDiscoveryBlockHash() {
  const section = elements.discoveryBlockHashSection;
  if (section) {
    section.style.display = "none";
  }
}

/**
 * Wait for the discovery block hash to be stored (after mining)
 * Polls localStorage until the hash appears or timeout
 * @returns {Promise<string|null>} The block hash or null if timeout
 */
async function waitForDiscoveryBlockHash() {
  const maxWaitMs = 60_000; // 60 seconds max wait
  const pollIntervalMs = 2_000; // Poll every 2 seconds
  const startTime = Date.now();
  const initialHash = getStoredDiscoveryBlockHash();

  return new Promise((resolve) => {
    const check = () => {
      const currentHash = getStoredDiscoveryBlockHash();
      // Wait for a new hash (different from initial, or if there was none)
      if (currentHash && currentHash !== initialHash) {
        resolve(currentHash);
        return;
      }
      // Also resolve if we have any hash and waited at least 10 seconds
      if (currentHash && Date.now() - startTime > 10_000) {
        resolve(currentHash);
        return;
      }
      if (Date.now() - startTime >= maxWaitMs) {
        resolve(currentHash || null);
        return;
      }
      setTimeout(check, pollIntervalMs);
    };
    setTimeout(check, pollIntervalMs);
  });
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
  logger.debug("KKTP: scanner deps", {
    hasConnect: typeof eventDeps.handleConnectToPeer === "function",
    hasJoinLobby: typeof eventDeps.handleJoinLobby === "function",
  });
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

    const isLobbyMode = dashboardState.isLobbyMode;

    if (isLobbyMode) {
      // Host a lobby
      const lobbyName = getLobbyNameInput() || `${dashboardState.gameName} Lobby`;

      updateBroadcastStatus("Hosting lobby...", "pending");
      const { lobbyId, discovery } = await lobbyManager.hostLobby({
        lobbyName,
        gameName: dashboardState.gameName,
        maxMembers: 16,
        uptimeSeconds: dashboardState.uptimeSeconds,
      });

      // Store our identity
      dashboardState.myPubSig = discovery.pub_sig;
      dashboardState.broadcastedDiscovery = discovery;
      updateIdentityDisplay(discovery.pub_sig);

      // Update lobby UI
      setActiveLobby(lobbyManager.lobbyInfo);
      updateLobbyStatus(lobbyManager.lobbyInfo);
      updateLobbyControlsVisibility(true, true);
      renderLobbyMembers(lobbyManager.members, true);

      // Show lobby status element
      if (elements.lobbyStatus) {
        elements.lobbyStatus.style.display = "block";
      }

      updateBroadcastStatus("Lobby hosted!", "success");
      logEvent(`Lobby hosted: ${lobbyId.substring(0, 8)}...`, "success");

      // Show discovery hash section - wait briefly for mining, then show stored hash
      setMissedStatus("Waiting for discovery to be mined...");
      waitForDiscoveryBlockHash().then((hash) => {
        if (hash) {
          showDiscoveryBlockHash(hash);
          setMissedStatus(`Discovery mined @ ${hash.slice(0, 8)}... - share with peers!`);
        }
      });
    } else {
      // Regular peer discovery
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

      // For regular discoveries, just show waiting message
      setMissedStatus("Waiting for discovery to be mined...");
    }

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

    // CRITICAL: Subscribe to DM mailbox so we can receive messages on this session
    // As the responder, we need this to receive replies from the initiator (e.g. lobby host)
    const dmPrefix = `KKTP:${mailboxId}:`;
    kaspaPortal.addPrefix(dmPrefix);
    logger.info("KKTP: Subscribed to DM mailbox (responder)", {
      mailboxId: mailboxId?.slice(0, 16),
      prefix: dmPrefix.slice(0, 32),
    });

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
 * Select a 1:1 session (switches away from lobby chat if active)
 */
function selectSession(mailboxId) {
  // Mark that we're now in 1:1 mode, not lobby
  dashboardState.activeLobbySelected = false;

  setActiveSession(mailboxId);

  const session = getSession(mailboxId);
  if (session) {
    setChatEnabled(true);
    renderChatMessages(session);
  }

  refreshSessionList();
}

/**
 * Select the lobby session (switches to lobby chat)
 */
function selectLobbySession() {
  // Mark that we're now in lobby mode for chat
  dashboardState.activeLobbySelected = true;

  // Clear 1:1 active session highlight
  dashboardState.activeSessionId = null;

  // Enable chat and render lobby messages
  setChatEnabled(true);
  if (lobbyManager) {
    renderLobbyChatMessages(lobbyManager.messageHistory, dashboardState.myPubSig);
  }

  refreshSessionList();
}

/**
 * Refresh the session list UI
 */
function refreshSessionList() {
  const sessions = kaspaPortal.getSessions();

  // Pass lobby callbacks so session list can render both 1:1 and lobby sessions
  renderSessionList(sessions, dashboardState.activeSessionId, selectSession, {
    onSelectLobby: selectLobbySession,
    lobbyManager: lobbyManager,
  });

  // Refresh peer list (regular peers only)
  renderPeerList(handleConnectToPeer);

  // Refresh lobby list (dedicated section)
  renderDiscoveredLobbies(handleJoinLobby);
}

/**
 * Handle joining a lobby
 */
async function handleJoinLobby(lobbyDiscovery) {
  if (!lobbyManager) {
    logEvent("Lobby manager not initialized", "error");
    return;
  }

  try {
    logEvent(`Joining lobby: ${lobbyDiscovery.meta.lobby_name}...`, "info");

    const displayName = dashboardState.gameName || "Anonymous";
    const result = await lobbyManager.joinLobby(lobbyDiscovery, displayName);

    if (result.pending) {
      logEvent("Join request sent, waiting for host approval...", "info");
      // The response will be handled by the message handler
    }
  } catch (err) {
    logEvent(`Join lobby failed: ${err.message}`, "error");
  }
}

/**
 * Handle leaving a lobby (member)
 */
async function handleLeaveLobby() {
  if (!lobbyManager || lobbyManager.currentState !== LOBBY_STATES.MEMBER) {
    logEvent("Not in a lobby", "error");
    return;
  }

  try {
    await lobbyManager.leaveLobby("Left voluntarily");
    clearActiveLobby();
    updateLobbyStatus(null);
    updateLobbyControlsVisibility(false, false);
    logEvent("Left lobby", "success");
  } catch (err) {
    logEvent(`Leave lobby failed: ${err.message}`, "error");
  }
}

/**
 * Handle closing a lobby (host)
 */
async function handleCloseLobby() {
  if (!lobbyManager || lobbyManager.currentState !== LOBBY_STATES.HOSTING) {
    logEvent("Not hosting a lobby", "error");
    return;
  }

  try {
    await lobbyManager.closeLobby("Closed by host");
    clearActiveLobby();
    updateLobbyStatus(null);
    updateLobbyControlsVisibility(false, false);

    // Hide discovery block hash section since lobby is closed
    hideDiscoveryBlockHash();

    // Reset lobby mode checkbox
    setLobbyModeChecked(false);
    setLobbyMode(false);
    if (elements.lobbyNameGroup) {
      elements.lobbyNameGroup.style.display = "none";
    }
    if (elements.lobbyStatus) {
      elements.lobbyStatus.style.display = "none";
    }

    logEvent("Lobby closed", "success");
  } catch (err) {
    logEvent(`Close lobby failed: ${err.message}`, "error");
  }
}

/**
 * Handle sending a message (supports both 1:1 and lobby)
 */
async function handleSendMessage() {
  const input = elements.messageInput;
  const plaintext = input?.value?.trim();

  if (!plaintext) return;

  // Check if lobby chat is selected AND we're actually in a lobby
  const inLobby = lobbyManager && (
    lobbyManager.currentState === LOBBY_STATES.HOSTING ||
    lobbyManager.currentState === LOBBY_STATES.MEMBER
  );

  if (dashboardState.activeLobbySelected && inLobby) {
    // Send to lobby group
    try {
      await lobbyManager.sendGroupMessage(plaintext);
      clearMessageInput();
      renderLobbyChatMessages(lobbyManager.messageHistory, dashboardState.myPubSig);
      logEvent("Lobby message sent", "success");
    } catch (err) {
      logEvent(`Lobby send failed: ${err.message}`, "error");
    }
    return;
  }

  // Regular 1:1 message
  if (!dashboardState.activeSessionId) {
    logEvent("No session selected for 1:1 message", "error");
    return;
  }

  try {
    await kaspaPortal.sendMessage(dashboardState.activeSessionId, plaintext);

    clearMessageInput();

    // Refresh the session to show the new message
    const session = getSession(dashboardState.activeSessionId);
    if (session) {
      renderChatMessages(session);
    }

    logEvent("Message sent", "success");
    scheduleSessionSave();
  } catch (err) {
    logEvent(`Send failed: ${err.message}`, "error");
  }
}

function getSession(mailboxId) {
  return kaspaPortal.getSessions().find((s) => s.mailboxId === mailboxId);
}

// Initialize on load
document.addEventListener("DOMContentLoaded", init);
