// Wallet test dashboard runner (Step 2)
// - Mirrors the indexer test dashboard behavior (PASS/FAIL markers, status dots, logs)
// - Avoids cache-busting wrapper/wasm modules (cache-busting can create multiple ES module
//   instances and break WASM-backed objects across tests)

/**
 * Test categories (tags)
 * - safe: non-destructive & validation tests
 * - funding: safe tests that may pause for funding (Step 3 will provide the modal)
 * - destructive: opt-in tests that mutate or delete persisted data
 * - stress: opt-in stress or resource-exhaustion tests
 * - multitab: opt-in concurrency tests that open additional tabs
 */

const TESTS = [
  {
    id: 'initGuards',
    title: 'Validation: init guards (pre-init calls)',
    importPath: './test_init_guards.js',
    exportName: 'runTestInitGuards',
    tags: ['safe']
  },
  {
    id: 'validationUtilities',
    title: 'Validation: utilities (payload/hex helpers)',
    importPath: './test_validation_utilities.js',
    exportName: 'runTestValidationUtilities',
    tags: ['safe']
  },
  {
    id: 'validationAddress',
    title: 'Validation: address format',
    importPath: './test_validation_address.js',
    exportName: 'runTestValidationAddress',
    tags: ['safe']
  },
  {
    id: 'liveConnectInitEnumerate',
    title: 'Live: connect + init + enumerate wallets',
    importPath: './test_live_connect_init_enumerate.js',
    exportName: 'runTestLiveConnectInitEnumerate',
    tags: ['safe']
  },
  {
    id: 'estimateValidation',
    title: 'Validation: estimateTransactionFee inputs',
    importPath: './test_estimate_validation.js',
    exportName: 'runTestEstimateValidation',
    tags: ['safe']
  },
  {
    id: 'walletCreateReopen',
    title: 'Live: create wallet + reopen existing',
    importPath: './test_wallet_create_reopen.js',
    exportName: 'runTestWalletCreateReopen',
    tags: ['safe']
  },
  {
    id: 'sendAmountValidationLive',
    title: 'Live: send() amount validation (0/-1)',
    importPath: './test_send_amount_validation_live.js',
    exportName: 'runTestSendAmountValidationLive',
    tags: ['safe', 'funding']
  },
  {
    id: 'walletWrongPassword',
    title: 'Live: wrong password handling',
    importPath: './test_wallet_wrong_password.js',
    exportName: 'runTestWalletWrongPassword',
    tags: ['safe']
  },
  {
    id: 'fundingWaitForUtxos',
    title: 'Funding-gated: wait for spendable UTXOs',
    importPath: './test_funding_wait_for_utxos.js',
    exportName: 'runTestFundingWaitForUtxos',
    tags: ['safe', 'funding']
  },
  {
    id: 'fundingSendSelfPayload',
    title: 'Funding-gated: send self tx + payload',
    importPath: './test_funding_send_self_payload.js',
    exportName: 'runTestFundingSendSelfPayload',
    tags: ['safe', 'funding']
  },
  {
    id: 'estimateFeeLive',
    title: 'Funding-gated: estimateTransactionFee() correctness + funded send',
    importPath: './test_estimate_fee_live.js',
    exportName: 'runTestEstimateFeeLive',
    tags: ['safe', 'funding']
  },
];

// Shared live test context (single networkId + rpcClient for all tests)
const walletTestContext = {
  networkId: null,
  rpcUrl: null,
  usePublicResolver: true,
  rpcClient: null,
  connected: false,
  connecting: false,
};

// Expose for test modules that prefer a global (optional).
// Tests should still accept the ctx param passed to them.
window.walletTestContext = walletTestContext;

function getEl(id) {
  return document.getElementById(id);
}

function normalizeRpcUrl(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  return s;
}

function setConnectionStatus(text, { isError = false } = {}) {
  const el = getEl('connectionStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? '#ff6b6b' : '';
}

async function connectFromUi(logFn = null) {
  if (walletTestContext.connecting) return walletTestContext.rpcClient;
  walletTestContext.connecting = true;

  try {
    const selNetworkId = getEl('selNetworkId');
    const chkUsePublicResolver = getEl('chkUsePublicResolver');
    const inputRpcUrl = getEl('inputRpcUrl');

    const networkId = String(selNetworkId?.value || '').trim();
    const usePublicResolver = !!chkUsePublicResolver?.checked;
    const rpcUrl = normalizeRpcUrl(inputRpcUrl?.value || '');

    if (!networkId) throw new Error('Network is required');
    if (!usePublicResolver && !rpcUrl) throw new Error('Node URL is required when not using public resolver');

    // Persist UI choices
    localStorage.setItem('wallet_test_networkId', networkId);
    localStorage.setItem('wallet_test_usePublicResolver', usePublicResolver ? '1' : '0');
    localStorage.setItem('wallet_test_rpcUrl', rpcUrl);

    walletTestContext.networkId = networkId;
    walletTestContext.usePublicResolver = usePublicResolver;
    walletTestContext.rpcUrl = rpcUrl;

    setConnectionStatus('Connecting…');
    if (typeof logFn === 'function') logFn(`[CONNECT] Connecting (${networkId})…`);

    const { connect } = await import('../../wrapper/kaspa_client.js');
    const client = await connect(usePublicResolver ? null : rpcUrl, networkId);

    walletTestContext.rpcClient = client;
    walletTestContext.connected = true;
    setConnectionStatus(`Connected: ${usePublicResolver ? 'public resolver' : rpcUrl} on ${networkId}`);
    if (typeof logFn === 'function') logFn('[CONNECT] Connected');
    return client;
  } catch (err) {
    walletTestContext.connected = false;
    walletTestContext.rpcClient = null;
    const msg = err && err.message ? err.message : String(err);
    setConnectionStatus('Connect failed: ' + msg, { isError: true });
    if (typeof logFn === 'function') logFn('[CONNECT] ERROR: ' + msg);
    throw err;
  } finally {
    walletTestContext.connecting = false;
  }
}

function setStatus(testId, state) {
  const el = document.getElementById('status-' + testId);
  if (!el) return;
  el.className = 'status ' + state;
}

function clearLog(testId) {
  const el = document.getElementById('log-' + testId);
  if (el) el.textContent = '';
}

function appendLog(testId, msg) {
  const el = document.getElementById('log-' + testId);
  if (!el) return;
  el.textContent += msg + '\n';
  el.scrollTop = el.scrollHeight;
}

function isPassResult(text) {
  const t = String(text || '');

  // Strict markers only (avoid false-fails from expected messages).
  const hasFailMarker = /(^|\n)\s*(\[FAIL\]|FAIL:|\[ERROR\]|ERROR:)/i.test(t);
  if (hasFailMarker) return false;

  const hasPassMarker = /(^|\n)\s*(\[PASS\]|PASS:|\[TEST\]\s*PASS)/i.test(t);
  return hasPassMarker;
}

async function cleanupAfterTest(testId) {
  // Best-effort cleanup to prevent background wallet activity and log spam from
  // leaking into subsequent tests.
  try {
    const walletService = await import('../../wrapper/wallet_service.js');

    if (typeof walletService.closeWallet === 'function') {
      try {
        await walletService.closeWallet();
        appendLog(testId, '[CLEANUP] closeWallet() ok');
      } catch (e) {
        appendLog(testId, '[CLEANUP] closeWallet() error: ' + (e && e.message ? e.message : String(e)));
      }
    }

    // Reset callbacks to no-ops so any late events won't write into a finished test log.
    if (typeof walletService.init === 'function' && walletTestContext.rpcClient && walletTestContext.networkId) {
      try {
        walletService.init({
          rpcClient: walletTestContext.rpcClient,
          networkId: walletTestContext.networkId,
          logger: () => {},
          onBalanceChange: () => {},
        });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

function isSafeTest(test) {
  const tags = Array.isArray(test.tags) ? test.tags : [];
  return !tags.includes('destructive') && !tags.includes('stress') && !tags.includes('multitab');
}

function shouldIncludeTest(test, opts) {
  // opts: { includeDestructive, includeStress, includeMultiTab }
  const tags = Array.isArray(test.tags) ? test.tags : [];

  if (tags.includes('destructive') && !opts.includeDestructive) return false;
  if (tags.includes('stress') && !opts.includeStress) return false;
  if (tags.includes('multitab') && !opts.includeMultiTab) return false;

  return true;
}

async function runDashboardTest({ testId, importPath, exportName }) {
  setStatus(testId, 'running');
  clearLog(testId);
  appendLog(testId, '[TEST] Running ' + exportName + ' from ' + importPath);

  try {
    const mod = await import(importPath);
    const fn = mod[exportName];
    if (typeof fn !== 'function') {
      throw new Error('Export not found: ' + exportName);
    }

    // Back-compat: tests may accept (logFn) or (logFn, ctx).
    const result = await fn((msg) => appendLog(testId, msg), walletTestContext);
    if (result) appendLog(testId, String(result));
    setStatus(testId, isPassResult(result) ? 'pass' : 'fail');
    return { ok: isPassResult(result), result };
  } catch (err) {
    appendLog(testId, 'ERROR: ' + (err && err.message ? err.message : err));
    setStatus(testId, 'fail');
    return { ok: false, error: err };
  } finally {
    await cleanupAfterTest(testId);
  }
}

function renderTestCards(tests) {
  const list = document.getElementById('testList');
  if (!list) return;

  list.innerHTML = '';

  if (!tests.length) {
    const li = document.createElement('li');
    li.className = 'test-card';
    li.innerHTML = `
      <div class="test-header">
        <div class="test-title">No wallet tests registered yet</div>
        <div class="status idle"></div>
      </div>
      <div class="controls">
        <button disabled>Run</button>
      </div>
      <div class="log">Add Step 4 test modules, then register them in tests/wallet/wallet_test_runner.js</div>
    `;
    list.appendChild(li);
    return;
  }

  for (const test of tests) {
    const li = document.createElement('li');
    const tags = Array.isArray(test.tags) ? test.tags : [];
    const isDanger = tags.includes('destructive') || tags.includes('stress') || tags.includes('multitab');

    li.className = 'test-card' + (isDanger ? ' danger' : '');
    li.innerHTML = `
      <div class="test-header">
        <div class="test-title">${escapeHtml(test.title || test.id)}</div>
        <div id="status-${escapeHtml(test.id)}" class="status idle"></div>
      </div>
      <div class="controls">
        <button id="btn-${escapeHtml(test.id)}">Run</button>
      </div>
      <div id="log-${escapeHtml(test.id)}" class="log"></div>
    `;
    list.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setAllButtonsDisabled(disabled) {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    // keep toggles unaffected
    if (btn.id === 'btnRunAllSafe' || btn.id === 'btnRunAllAll' || btn.id.startsWith('btn-')) {
      btn.disabled = disabled;
    }
  }
}

async function runAllSequential(tests, opts) {
  const selected = tests.filter((t) => shouldIncludeTest(t, opts));
  for (const test of selected) {
    await runDashboardTest({
      testId: test.id,
      importPath: test.importPath,
      exportName: test.exportName,
    });
  }
}

function initDashboard() {
  // Wire centralized connection controls
  const selNetworkId = getEl('selNetworkId');
  const chkUsePublicResolver = getEl('chkUsePublicResolver');
  const inputRpcUrl = getEl('inputRpcUrl');
  const btnConnect = getEl('btnConnect');

  if (selNetworkId) {
    const savedNetworkId = localStorage.getItem('wallet_test_networkId');
    if (savedNetworkId) selNetworkId.value = savedNetworkId;
  }

  if (chkUsePublicResolver) {
    const savedUse = localStorage.getItem('wallet_test_usePublicResolver');
    if (savedUse === '0' || savedUse === '1') chkUsePublicResolver.checked = savedUse === '1';
  }

  if (inputRpcUrl) {
    const savedUrl = localStorage.getItem('wallet_test_rpcUrl');
    if (savedUrl) inputRpcUrl.value = savedUrl;
  }

  function syncRpcUrlEnabled() {
    const usePublic = !!chkUsePublicResolver?.checked;
    if (inputRpcUrl) inputRpcUrl.disabled = usePublic;
  }

  chkUsePublicResolver?.addEventListener('change', syncRpcUrlEnabled);
  syncRpcUrlEnabled();

  btnConnect?.addEventListener('click', async () => {
    // Connect using the dashboard log area of the first test if available, else status only.
    // (Step 4 tests will also log connect steps themselves.)
    try {
      await connectFromUi(null);
    } catch {
      // status already updated
    }
  });

  // Initialize status on load
  setConnectionStatus('Not connected.');

  const toggles = {
    destructive: document.getElementById('toggleDestructive'),
    stress: document.getElementById('toggleStress'),
    multiTab: document.getElementById('toggleMultiTab'),
  };

  const btnRunAllSafe = document.getElementById('btnRunAllSafe');
  const btnRunAllAll = document.getElementById('btnRunAllAll');

  function updateRunAllAllEnabled() {
    const enabled = !!(toggles.destructive?.checked || toggles.stress?.checked || toggles.multiTab?.checked);
    btnRunAllAll.disabled = !enabled;
  }

  toggles.destructive?.addEventListener('change', updateRunAllAllEnabled);
  toggles.stress?.addEventListener('change', updateRunAllAllEnabled);
  toggles.multiTab?.addEventListener('change', updateRunAllAllEnabled);
  updateRunAllAllEnabled();

  renderTestCards(TESTS);

  // Individual run buttons
  for (const test of TESTS) {
    const btn = document.getElementById('btn-' + test.id);
    if (!btn) continue;
    btn.onclick = async () => {
      setAllButtonsDisabled(true);
      try {
        await runDashboardTest({ testId: test.id, importPath: test.importPath, exportName: test.exportName });
      } finally {
        setAllButtonsDisabled(false);
        updateRunAllAllEnabled();
      }
    };
  }

  btnRunAllSafe.onclick = async () => {
    setAllButtonsDisabled(true);
    try {
      const safeTests = TESTS.filter(isSafeTest);
      await runAllSequential(safeTests, {
        includeDestructive: false,
        includeStress: false,
        includeMultiTab: false,
      });
    } finally {
      setAllButtonsDisabled(false);
      updateRunAllAllEnabled();
    }
  };

  btnRunAllAll.onclick = async () => {
    setAllButtonsDisabled(true);
    try {
      await runAllSequential(TESTS, {
        includeDestructive: !!toggles.destructive?.checked,
        includeStress: !!toggles.stress?.checked,
        includeMultiTab: !!toggles.multiTab?.checked,
      });
    } finally {
      setAllButtonsDisabled(false);
      updateRunAllAllEnabled();
    }
  };
}

// Auto-init once loaded.
initDashboard();
