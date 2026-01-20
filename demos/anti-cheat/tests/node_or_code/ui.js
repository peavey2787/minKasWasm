import { $, setBadge, appendLog } from './dom.js';
import { blocksPerSecond10s } from './state.js';
import { percentile } from './math.js';

export function setEnabled({ connected, walletReady, running, hasResults, hasWalletAddress }) {
  $('btnConnect').disabled = running;
  $('btnWallet').disabled = !connected || running;
  $('btnCopyAddr').disabled = !hasWalletAddress;
  $('btnRun').disabled = !(connected && walletReady) || running;
  $('btnStop').disabled = !running;
  $('btnExport').disabled = !hasResults;

  const btnCal = $('btnCalibrate');
  if (btnCal) btnCal.disabled = !(connected && walletReady) || running;
}

export function setConnStatus(connected) {
  setBadge('connStatus', connected ? 'Connected' : 'Disconnected', connected ? 'connected' : 'disconnected');
}

export function setWalletStatus(statusText, cls) {
  setBadge('walletStatus', statusText, cls);
}

export function setRunStatus(text, cls) {
  setBadge('runStatus', text, cls);
}

export function setRunUiState({ running, badgeText, badgeClass, statusText } = {}) {
  if (badgeText != null) {
    setBadge('runStatusBadge', badgeText, badgeClass || (running ? 'connected' : 'pending'));
  }

  // Keep the original header badge in sync for quick visibility
  if (badgeText != null) {
    setBadge('runStatus', badgeText, badgeClass || (running ? 'connected' : 'pending'));
  }

  const spinner = $('runSpinner');
  if (spinner) spinner.classList.toggle('on', !!running);

  const msg = $('runStatusText');
  if (msg && statusText != null) msg.textContent = statusText;
}

export function clearLogs() {
  appendLog('blocksLog', '', { clear: true });
  appendLog('eventsLog', '', { clear: true });
}

export function logBlock(line) {
  appendLog('blocksLog', line);
}

export function logEvent(line) {
  appendLog('eventsLog', line);
}

export function updateStats({ sent, sendOk, detected, missing, noDecoded, latencies }) {
  $('bps').textContent = blocksPerSecond10s().toFixed(1);
  $('sent').textContent = String(sent);
  $('sendOk').textContent = String(sendOk);
  $('detected').textContent = String(detected);
  $('missing').textContent = String(missing);
  $('noDecoded').textContent = String(noDecoded);

  if (latencies.length) {
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const max = Math.max(...latencies);
    $('latency').textContent = `${Math.round(p50)} / ${Math.round(p95)} / ${Math.round(max)}`;
  } else {
    $('latency').textContent = '--';
  }
}

export function updateQueueStats({ depth, retries, lastError } = {}) {
  const depthEl = $('queueDepth');
  if (depthEl) depthEl.textContent = depth == null ? '--' : String(depth);

  const retriesEl = $('queueRetries');
  if (retriesEl) retriesEl.textContent = retries == null ? '--' : String(retries);

  const lastErrEl = $('queueLastError');
  if (lastErrEl) {
    if (!lastError) {
      lastErrEl.textContent = '--';
    } else if (typeof lastError === 'string') {
      lastErrEl.textContent = lastError;
    } else {
      lastErrEl.textContent = lastError?.message ?? String(lastError);
    }
  }
}
