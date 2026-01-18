// Funding-gate modal for live integration tests.
//
// Usage (from a test module):
//   import { awaitFunding } from './funding_modal.js';
//   await awaitFunding({
//     address,
//     minSompi: 100000n,
//     getSpendableSompi: () => getSpendableBalance(),
//     logFn,
//   });
//
// This file intentionally injects its own styles so Step 3 stays self-contained.

const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

let modalRoot = null;
let modalStyleEl = null;

function ensureModal() {
  if (modalRoot) return;

  modalStyleEl = document.createElement('style');
  modalStyleEl.textContent = `
    .wallet-test-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.65);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 20px;
    }
    .wallet-test-modal {
      width: min(640px, 100%);
      border: 1px solid #49eacb;
      border-radius: 12px;
      background: #2d292a;
      color: #49eacb;
      box-shadow: 0 10px 30px rgba(0,0,0,0.45);
      padding: 14px;
    }
    .wallet-test-modal h2 {
      margin: 0 0 10px 0;
      font-size: 18px;
    }
    .wallet-test-modal .row {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin: 10px 0;
    }
    .wallet-test-modal .addr {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      border: 1px solid #49eacb;
      background: #231F20;
      border-radius: 8px;
      padding: 10px;
      word-break: break-all;
      flex: 1 1 auto;
      min-width: 240px;
      user-select: text;
    }
    .wallet-test-modal .hint {
      opacity: 0.9;
      font-size: 12px;
      line-height: 1.35;
    }
    .wallet-test-modal .kpi {
      font-size: 12px;
      opacity: 0.95;
    }
    .wallet-test-modal .kpi strong {
      font-weight: 700;
    }
    .wallet-test-modal .danger {
      border-color: #b00020;
      color: #ffb3c1;
    }
    .wallet-test-modal .footer {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      align-items: center;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    .wallet-test-modal .small {
      font-size: 11px;
      opacity: 0.8;
      margin-right: auto;
    }
  `;
  document.head.appendChild(modalStyleEl);

  modalRoot = document.createElement('div');
  modalRoot.className = 'wallet-test-modal-backdrop';
  modalRoot.innerHTML = `
    <div class="wallet-test-modal" role="dialog" aria-modal="true" aria-label="Funding required">
      <h2 id="walletTestModalTitle">Funding required</h2>
      <div class="hint" id="walletTestModalHint">
        Send funds to the address below. This test will auto-resume once spendable UTXOs are detected.
      </div>

      <div class="row">
        <div class="addr" id="walletTestModalAddress" title="Receive address"></div>
        <button id="walletTestModalCopy">Copy</button>
      </div>

      <div class="row kpi">
        <div><strong>Required:</strong> <span id="walletTestModalRequired"></span></div>
        <div><strong>Spendable:</strong> <span id="walletTestModalSpendable">(checking…)</span></div>
      </div>

      <div class="footer">
        <div class="small" id="walletTestModalFootnote"></div>
        <button id="walletTestModalCancel" class="danger">Cancel test</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalRoot);

  modalRoot.addEventListener('click', (e) => {
    // Click outside modal does nothing (tests should proceed deterministically).
    // Keep deterministic behavior by requiring explicit cancel.
    e.stopPropagation();
  });

  document.getElementById('walletTestModalCopy').addEventListener('click', async () => {
    const addr = document.getElementById('walletTestModalAddress').textContent || '';
    await copyToClipboard(addr);
  });
}

function showModal({ title, hint, address, requiredSompi, footnote }) {
  ensureModal();
  document.getElementById('walletTestModalTitle').textContent = title;
  document.getElementById('walletTestModalHint').textContent = hint;
  document.getElementById('walletTestModalAddress').textContent = address;
  document.getElementById('walletTestModalRequired').textContent = formatSompi(requiredSompi);
  document.getElementById('walletTestModalSpendable').textContent = '(checking…)';
  document.getElementById('walletTestModalFootnote').textContent = footnote || '';
  modalRoot.style.display = 'flex';
}

function hideModal() {
  if (!modalRoot) return;
  modalRoot.style.display = 'none';
}

async function copyToClipboard(text) {
  const t = String(text || '');
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(t);
      return;
    }
  } catch {
    // fall back
  }

  // Fallback: temporary textarea selection
  const ta = document.createElement('textarea');
  ta.value = t;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(ta);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowMs() {
  return Date.now();
}

/**
 * Format sompi as a readable string.
 * Keeps it simple here; later we can add network-specific decimal display.
 */
export function formatSompi(value) {
  try {
    const v = typeof value === 'bigint' ? value : BigInt(value);
    return `${v.toString()} sompi`;
  } catch {
    return String(value);
  }
}

/**
 * Await funding for integration tests.
 *
 * - Opens a modal with the receive address + copy.
 * - Polls spendable balance until it meets/exceeds `minSompi`.
 * - Auto-closes and resolves once funded.
 * - Throws on timeout or user cancel.
 *
 * @param {Object} params
 * @param {string} params.address - Wallet receive address to show.
 * @param {bigint|number|string} params.minSompi - Minimum spendable sompi required.
 * @param {() => Promise<bigint>|() => bigint} params.getSpendableSompi - Returns spendable sompi.
 * @param {(handlers: { onUpdate: () => void }) => (() => void)|void} [params.subscribe] - Optional event subscription.
 *        When provided, awaitFunding will re-check spendable immediately on updates (no polling delay).
 * @param {(msg:string)=>void} [params.logFn] - Optional logger for test output.
 * @param {number} [params.pollIntervalMs]
 * @param {number} [params.timeoutMs]
 * @param {string} [params.title]
 * @param {string} [params.hint]
 */
export async function awaitFunding({
  address,
  minSompi,
  getSpendableSompi,
  subscribe = null,
  logFn = null,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  title = 'Funding required',
  hint = 'Send funds to the address below. This test will auto-resume once spendable UTXOs are detected.',
} = {}) {
  if (!address || typeof address !== 'string') {
    throw new Error('awaitFunding requires a receive address');
  }
  if (typeof getSpendableSompi !== 'function') {
    throw new Error('awaitFunding requires getSpendableSompi()');
  }

  const required = typeof minSompi === 'bigint' ? minSompi : BigInt(minSompi);
  const started = nowMs();

  let cancelled = false;
  let notified = false;
  let unsubscribe = null;
  ensureModal();

  const cancelBtn = document.getElementById('walletTestModalCancel');
  const onCancel = () => {
    cancelled = true;
  };
  cancelBtn.addEventListener('click', onCancel);

  showModal({
    title,
    hint,
    address,
    requiredSompi: required,
    footnote: `Timeout: ${Math.floor(timeoutMs / 1000)}s | Poll: ${pollIntervalMs}ms`,
  });

  if (typeof logFn === 'function') {
    logFn(`[FUNDING] Required: ${formatSompi(required)} | Address: ${address}`);
  }

  // Prefer event-driven wake-ups when available.
  // We still keep a polling fallback for robustness (e.g., missed events).
  if (typeof subscribe === 'function') {
    try {
      unsubscribe = subscribe({
        onUpdate: () => {
          notified = true;
        },
      });
    } catch (err) {
      if (typeof logFn === 'function') {
        logFn('[FUNDING] Subscribe failed; falling back to polling.');
      }
    }
  }

  try {
    while (true) {
      if (cancelled) {
        throw new Error('Funding was cancelled by the user');
      }

      const elapsed = nowMs() - started;
      if (elapsed > timeoutMs) {
        throw new Error('Funding timed out');
      }

      // If we have event notifications, we re-check immediately after an update.
      // Otherwise, we poll on a fixed interval.
      const shouldCheckNow = notified;
      if (!shouldCheckNow) {
        await sleep(pollIntervalMs);
      }
      notified = false;

      let spendable;
      try {
        spendable = await getSpendableSompi();
      } catch (err) {
        // Keep waiting but show error in the modal.
        const msg = err && err.message ? err.message : String(err);
        document.getElementById('walletTestModalSpendable').textContent = `(error: ${msg})`;
        if (typeof logFn === 'function') logFn(`[FUNDING] Spendable check error: ${msg}`);
        // Keep waiting.
        continue;
      }

      const spendableBig = typeof spendable === 'bigint' ? spendable : BigInt(spendable);
      document.getElementById('walletTestModalSpendable').textContent = formatSompi(spendableBig);

      if (typeof logFn === 'function') {
        logFn(`[FUNDING] Spendable now: ${formatSompi(spendableBig)}`);
      }

      if (spendableBig >= required) {
        hideModal();
        if (typeof logFn === 'function') {
          logFn('[FUNDING] Funding detected; resuming test.');
        }
        return { spendableSompi: spendableBig };
      }
    }
  } finally {
    cancelBtn.removeEventListener('click', onCancel);
    try {
      if (typeof unsubscribe === 'function') unsubscribe();
    } catch {
      // ignore
    }
    // If the test threw, ensure we don't leave the modal stuck open.
    if (cancelled) hideModal();
  }
}
