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
 * Update UTXO status display
 * @param {number} usableCount - Number of usable UTXOs
 * @param {number} smallCount - Number of small (unusable) UTXOs
 * @param {number} balanceKas - Total balance in KAS
 * @param {boolean} [isError=false] - Whether there's an error state
 */
export function updateUtxoStatus(usableCount, smallCount, balanceKas, isError = false) {
  const el = elements.utxoStatus;
  if (!el) return;

  if (isError) {
    el.textContent = "UTXO: Error";
    el.className = "badge rounded-pill text-bg-danger utxo-badge";
    el.title = "Heartbeat error - check console";
    return;
  }

  // Determine status level based on usable UTXO count
  let statusClass = "text-bg-success";
  let statusText = `${usableCount} UTXOs`;

  if (usableCount === 0) {
    statusClass = "text-bg-danger utxo-critical";
    statusText = "0 UTXOs!";
  } else if (usableCount < 3) {
    statusClass = "text-bg-warning";
    statusText = `${usableCount} UTXOs`;
  } else if (usableCount < 5) {
    statusClass = "text-bg-info";
  }

  el.textContent = statusText;
  el.className = `badge rounded-pill ${statusClass} utxo-badge`;
  el.title = `Usable: ${usableCount} | Small: ${smallCount} | Balance: ${balanceKas.toFixed(2)} KAS`;
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
 * Update join status display
 */
export function setJoinStatus(text) {
  const el = elements.joinStatus;
  if (!el) return;
  el.textContent = text || "";
}
