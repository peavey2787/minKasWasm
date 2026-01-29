// statusDisplay.js - Connection, scanner, and identity status displays
import { elements } from "../dom.js";

/**
 * Update connection status display
 */
export function updateConnectionStatus(isConnected, networkId = "") {
  const el = elements.connectionStatus;
  if (!el) return;

  if (isConnected) {
    el.textContent = `Connected: ${networkId}`;
    el.className = "badge rounded-pill text-bg-success";
  } else {
    el.textContent = "Disconnected";
    el.className = "badge rounded-pill text-bg-danger";
  }
}

/**
 * Update scanner status display
 */
export function updateScannerStatus(state) {
  const el = elements.scannerStatus;
  if (!el) return;

  if (typeof state === "boolean") {
    state = state ? "ready" : "idle";
  }

  if (state === "syncing") {
    el.textContent = "Syncing";
    el.className = "badge rounded-pill text-bg-warning";
    return;
  }

  if (state === "ready") {
    el.textContent = "Ready";
    el.className = "badge rounded-pill text-bg-success";
    return;
  }

  el.textContent = "Idle";
  el.className = "badge rounded-pill text-bg-secondary";
}

/**
 * Update identity display
 */
export function updateIdentityDisplay(pubSig) {
  const el = elements.identityDisplay;
  if (!el) return;

  if (pubSig) {
    el.textContent = `${pubSig.substring(0, 8)}...${pubSig.substring(pubSig.length - 8)}`;
    el.title = pubSig;
    el.className = "small text-accent";
  } else {
    el.className = "small text-secondary";
    el.innerHTML =
      'Fund your wallet via the <a href="https://faucet-tn10.kaspanet.io/" target="_blank" rel="noopener">Testnet-10 faucet</a> — copy the address below and send test KAS.';
  }
}

/**
 * Update broadcast status
 */
export function updateBroadcastStatus(status, type = "info") {
  const el = elements.broadcastStatus;
  if (!el) return;

  el.textContent = status;
  el.className = "small text-center";
  if (type === "success") el.classList.add("text-success");
  else if (type === "error") el.classList.add("text-danger");
  else if (type === "pending") el.classList.add("text-warning");
  else el.classList.add("text-secondary");
}

/**
 * Update missed-scan status
 */
export function setMissedStatus(text) {
  const el = elements.missedStatus;
  if (!el) return;
  el.textContent = text || "";
}
