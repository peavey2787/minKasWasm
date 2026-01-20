import { $, appendLog, copyText, downloadJson } from './dom.js';
import { demoState, resetTxFlowState } from './state.js';
import {
  logStep,
  renderWalletInfo,
  renderUtxos,
  renderUtxoStats,
  renderSelectionStats,
  renderPendingTx,
  renderDerivedKeys,
  renderSubmit,
  setConnStatus,
  setWalletStatus,
  setUtxoStatus,
  setSelectStatus,
  setBuildStatus,
  setSignStatus,
  setSubmitStatus,
  setEnabled,
} from './ui.js';

import { connect as connectRpc } from '../../wrapper/kaspa_client.js';
import * as walletService from '../../wrapper/wallet_service.js';
import { sompiToKaspaString } from '../../kas-wasm/kaspa.js';

import { fetchAccountUtxos } from './steps/utxos.js';
import { deriveReceiveAndChange0 } from './steps/keys.js';
import { buildPendingTx, parseKasToSompi } from './steps/tx.js';
import { signPendingTx, submitPendingTx } from './steps/submit.js';
import { estimateTransaction } from '../../wrapper/tx_builder.js';

let postConnectWired = false;

function clearLog(step) {
  const el = $(`log_${step}`);
  if (el) el.textContent = '';
}

function clearAllLogs() {
  for (const step of ['wallet', 'utxo', 'select', 'build', 'sign', 'submit']) clearLog(step);
  demoState.session.events = [];
}

function currentInputsTargetSompi() {
  try {
    return parseKasToSompi($('selectTargetKas').value);
  } catch {
    return 0n;
  }
}

function computeSelectionFromOutpoints() {
  const selected = [];
  let sum = 0n;

  for (const e of demoState.utxos) {
    if (demoState.selectedOutpoints.has(e.outpoint)) {
      selected.push(e);
      sum += e.amountSompi;
    }
  }

  demoState.selectedEntries = selected;
  demoState.selectedSumSompi = sum;

  const targetSompi = currentInputsTargetSompi();
  renderSelectionStats({ targetSompi });

  if (selected.length === 0) {
    setSelectStatus('None', 'pending');
  } else {
    setSelectStatus(`${selected.length} selected`, 'connected');
  }
}

function resetBuildSignSubmit() {
  demoState.pendingTx = null;
  demoState.pendingTxJson = null;
  demoState.pendingTxSummary = null;
  demoState.derivedKeys = null;
  demoState.signed = false;
  demoState.submitRes = null;
  demoState.txid = null;

  setBuildStatus('Not built', 'pending');
  setSignStatus('Not signed', 'pending');
  setSubmitStatus('Not submitted', 'pending');

  renderPendingTx();
  renderDerivedKeys();
  renderSubmit();
}

async function onEstimate() {
  // estimating changes the required-input math, so clear any previously built tx/signature.
  resetBuildSignSubmit();

  setBuildStatus('Estimating...', 'pending');
  logStep('build', `Estimating from ${demoState.selectedEntries.length} input(s)...`);

  const selectedRawEntries = demoState.selectedEntries.map((e) => e.raw);
  const toAddress = $('toAddress').value?.trim();
  const amountSompi = parseKasToSompi($('sendAmountKas').value);
  const priorityFeeSompi = parseKasToSompi($('priorityFeeKas').value);
  const payload = $('payload').value?.trim() || undefined;

  const changeOverride = $('changeAddressOverride').value?.trim() || null;
  const changeAddress = changeOverride || demoState.walletChangeAddress || demoState.walletReceiveAddress;

  try {
    const outputs = [{ address: String(toAddress), amount: amountSompi }];

    const est = await estimateTransaction({
      entries: selectedRawEntries,
      outputs,
      priorityFee: priorityFeeSompi,
      changeAddress,
      networkId: demoState.networkId,
      payload,
      logger: (m) => logStep('build', String(m)),
      debug: true,
    });

    const requiredSompi = (est.finalAmount != null ? est.finalAmount : amountSompi + (est.fees ?? 0n));

    // Update selection target to amount+fees so UTXO selection can be done correctly.
    $('selectTargetKas').value = sompiToKaspaString(requiredSompi);
    computeSelectionFromOutpoints();

    // Populate the existing summary panel for visibility (even before build).
    demoState.pendingTxSummary = { mass: est.mass, feeAmount: est.fees };
    demoState.pendingTxJson = JSON.stringify(est, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
    renderPendingTx();

    setBuildStatus('Estimated', 'connected');
    logStep('build', `Estimate OK: mass=${est.mass} fee=${est.feesKas} KAS`);
    logStep('build', `Required inputs (amount+fees) ≈ ${sompiToKaspaString(requiredSompi)} KAS`);

    if (demoState.selectedSumSompi < requiredSompi) {
      logStep('build', `Selection is short by ${sompiToKaspaString(requiredSompi - demoState.selectedSumSompi)} KAS (select more inputs).`);
    }
  } catch (err) {
    const msg = err?.message || String(err);
    setBuildStatus('Estimate failed', 'disconnected');
    logStep('build', `Estimate failed: ${msg}`);

    // Common KIP-0009/Crescendo issue: too-small output amount for current UTXO set.
    if (/storage mass exceeds maximum/i.test(msg)) {
      logStep('build', 'Hint: bump Amount (KAS) (e.g. 0.2) or consolidate UTXOs (fewer/larger inputs).');
    }
  } finally {
    setEnabled();
  }
}

async function refreshBalance() {
  try {
    const balSompi = await walletService.getSpendableBalance();
    demoState.walletBalanceMatureKas = sompiToKaspaString(balSompi);
    renderWalletInfo();
  } catch (err) {
    logStep('wallet', `Balance refresh failed: ${err?.message || String(err)}`);
  }
}

async function onConnectClick() {
  clearLog('wallet');
  clearLog('utxo');
  clearLog('select');
  clearLog('build');
  clearLog('sign');
  clearLog('submit');

  resetTxFlowState();
  resetBuildSignSubmit();

  demoState.networkId = $('networkId').value;
  demoState.nodeUrl = $('nodeUrl').value?.trim() || null;

  setConnStatus(false);
  setWalletStatus('Not Ready', 'pending');
  setUtxoStatus('Not fetched', 'pending');
  setSelectStatus('None', 'pending');
  setBuildStatus('Not built', 'pending');
  setSignStatus('Not signed', 'pending');
  setSubmitStatus('Not submitted', 'pending');

  try {
    logStep('wallet', `Connecting RPC (${demoState.networkId})...`);
    const client = await connectRpc(demoState.nodeUrl, demoState.networkId, {
      onDisconnect: async () => {
        demoState.connected = false;
        demoState.client = null;
        setConnStatus(false);
        setEnabled();
        logStep('wallet', 'RPC disconnected.');
      },
    });

    demoState.client = client;
    demoState.connected = true;
    setConnStatus(true);

    walletService.init({
      rpcClient: client,
      networkId: demoState.networkId,
      logger: (msg, ...rest) => logStep('wallet', [msg, ...rest].map(String).join(' ')),
      onBalanceChange: (matureKas) => {
        demoState.walletBalanceMatureKas = String(matureKas);
        renderWalletInfo();
      },
    });

    setWalletStatus('RPC ready', 'connected');
    logStep('wallet', 'RPC connected. Wallet SDK initialized.');

    // Connect is the explicit "start" signal: only now do we wire the rest of the UI
    // and run any rendering that may touch WASM helpers.
    wirePostConnectUiOnce();
    startUiAfterConnect();
  } catch (err) {
    demoState.connected = false;
    demoState.client = null;
    setConnStatus(false);
    setWalletStatus('Connect failed', 'disconnected');
    logStep('wallet', `Connect failed: ${err?.message || String(err)}`);
  } finally {
    setEnabled();
  }
}

async function onWalletClick() {
  demoState.walletFilename = $('walletFilename').value?.trim() || 'rapid_tx_demo';
  const password = $('walletPassword').value;

  setWalletStatus('Opening...', 'pending');
  logStep('wallet', `Opening/creating wallet '${demoState.walletFilename}'...`);

  try {
    await walletService.createWallet({
      password,
      filename: demoState.walletFilename,
      discoverAddresses: false,
      storeMnemonic: false,
    });

    const ctx = walletService.getWalletContext();
    const accounts = await ctx.wallet.accountsEnumerate();
    const active = accounts?.accountDescriptors?.[ctx.currentAccountIndex ?? 0];

    demoState.walletReceiveAddress = active?.receiveAddress ? String(active.receiveAddress) : null;
    demoState.walletChangeAddress = active?.changeAddress ? String(active.changeAddress) : null;
    demoState.walletReady = true;

    // helpful default: self-send
    if ($('toAddress').value.trim() === '' && demoState.walletReceiveAddress) {
      $('toAddress').value = demoState.walletReceiveAddress;
    }

    setWalletStatus('Ready', 'connected');
    renderWalletInfo();

    logStep('wallet', `Receive: ${demoState.walletReceiveAddress || '--'}`);
    logStep('wallet', `Change: ${demoState.walletChangeAddress || '--'}`);

    await refreshBalance();
  } catch (err) {
    demoState.walletReady = false;
    setWalletStatus('Wallet failed', 'disconnected');
    logStep('wallet', `Wallet open/create failed: ${err?.message || String(err)}`);
  } finally {
    setEnabled();
  }
}

async function onFetchUtxosClick() {
  resetTxFlowState();
  resetBuildSignSubmit();

  setUtxoStatus('Fetching...', 'pending');
  logStep('utxo', 'Fetching UTXOs...');

  try {
    const ctx = walletService.getWalletContext();

    const includeReceive = !!$('utxoScopeReceive').checked;
    const includeChange = !!$('utxoScopeChange').checked;

    const { normalized, stats } = await fetchAccountUtxos({
      wallet: ctx.wallet,
      receiveAddress: demoState.walletReceiveAddress,
      changeAddress: demoState.walletChangeAddress,
      includeReceive,
      includeChange,
      logger: (m) => logStep('utxo', m),
    });

    demoState.utxos = normalized;
    demoState.utxoStats = stats;

    // clear selection
    demoState.selectedOutpoints.clear();
    computeSelectionFromOutpoints();

    renderUtxoStats();
    renderUtxos({
      onToggle: (idx, checked) => {
        const e = demoState.utxos[idx];
        if (!e) return;
        if (checked) demoState.selectedOutpoints.add(e.outpoint);
        else demoState.selectedOutpoints.delete(e.outpoint);

        computeSelectionFromOutpoints();
        resetBuildSignSubmit();
        setEnabled();
      },
    });

    $('utxoSelectAll').checked = false;

    setUtxoStatus('Fetched', 'connected');
    logStep('utxo', `UTXO table rendered (${demoState.utxos.length}).`);
  } catch (err) {
    setUtxoStatus('Fetch failed', 'disconnected');
    logStep('utxo', `Fetch failed: ${err?.message || String(err)}`);
  } finally {
    setEnabled();
  }
}

function onSelectAllChanged() {
  const checked = $('utxoSelectAll').checked;
  demoState.selectedOutpoints.clear();
  if (checked) {
    for (const e of demoState.utxos) demoState.selectedOutpoints.add(e.outpoint);
  }

  computeSelectionFromOutpoints();
  renderUtxos({
    onToggle: (idx, cbChecked) => {
      const e = demoState.utxos[idx];
      if (!e) return;
      if (cbChecked) demoState.selectedOutpoints.add(e.outpoint);
      else demoState.selectedOutpoints.delete(e.outpoint);
      computeSelectionFromOutpoints();
      resetBuildSignSubmit();
      setEnabled();
    },
  });

  resetBuildSignSubmit();
  setEnabled();
}

function onAutoSelect() {
  const targetSompi = currentInputsTargetSompi();
  const maxInputs = Math.max(1, Number($('selectMaxInputs').value || 1));

  const sorted = [...demoState.utxos].sort((a, b) => (a.amountSompi === b.amountSompi ? 0 : a.amountSompi > b.amountSompi ? -1 : 1));

  demoState.selectedOutpoints.clear();
  let sum = 0n;
  let count = 0;

  for (const e of sorted) {
    if (count >= maxInputs) break;
    if (e.amountSompi <= 0n) continue;
    demoState.selectedOutpoints.add(e.outpoint);
    sum += e.amountSompi;
    count++;
    if (sum >= targetSompi && targetSompi > 0n) break;
  }

  logStep('select', `Auto-selected ${count} input(s). Sum=${sompiToKaspaString(sum)} KAS`);

  computeSelectionFromOutpoints();
  renderUtxos({
    onToggle: (idx, checked) => {
      const e = demoState.utxos[idx];
      if (!e) return;
      if (checked) demoState.selectedOutpoints.add(e.outpoint);
      else demoState.selectedOutpoints.delete(e.outpoint);
      computeSelectionFromOutpoints();
      resetBuildSignSubmit();
      setEnabled();
    },
  });

  resetBuildSignSubmit();
  setEnabled();
}

function onClearSelect() {
  demoState.selectedOutpoints.clear();
  computeSelectionFromOutpoints();
  renderUtxos({
    onToggle: (idx, checked) => {
      const e = demoState.utxos[idx];
      if (!e) return;
      if (checked) demoState.selectedOutpoints.add(e.outpoint);
      else demoState.selectedOutpoints.delete(e.outpoint);
      computeSelectionFromOutpoints();
      resetBuildSignSubmit();
      setEnabled();
    },
  });

  resetBuildSignSubmit();
  setEnabled();
}

async function onBuild() {
  setBuildStatus('Building...', 'pending');
  logStep('build', `Building tx from ${demoState.selectedEntries.length} input(s)...`);

  try {
    const selectedRawEntries = demoState.selectedEntries.map((e) => e.raw);

    const toAddress = $('toAddress').value?.trim();
    const amountSompi = parseKasToSompi($('sendAmountKas').value);
    const priorityFeeSompi = parseKasToSompi($('priorityFeeKas').value);
    const payload = $('payload').value?.trim() || undefined;

    const changeOverride = $('changeAddressOverride').value?.trim() || null;
    const changeAddress = changeOverride || demoState.walletChangeAddress || demoState.walletReceiveAddress;

    const { pendingTx, summary, json } = await buildPendingTx({
      entries: selectedRawEntries,
      toAddress,
      amountSompi,
      priorityFeeSompi,
      changeAddress,
      networkId: demoState.networkId,
      payload,
    });

    demoState.pendingTx = pendingTx;
    demoState.pendingTxSummary = summary;
    demoState.pendingTxJson = json;
    demoState.signed = false;
    demoState.txid = null;
    demoState.submitRes = null;

    renderPendingTx();
    renderSubmit();

    setBuildStatus('Built', 'connected');
    setSignStatus('Not signed', 'pending');
    setSubmitStatus('Not submitted', 'pending');

    const addrs = typeof pendingTx.addresses === 'function' ? pendingTx.addresses() : [];
    logStep('build', `Input addresses: ${Array.isArray(addrs) ? addrs.join(', ') : String(addrs)}`);
    logStep('build', `Mass=${summary.mass}, Fee=${sompiToKaspaString(summary.feeAmount)} KAS, Change=${sompiToKaspaString(summary.changeAmount)} KAS`);
  } catch (err) {
    setBuildStatus('Build failed', 'disconnected');
    logStep('build', `Build failed: ${err?.message || String(err)}`);
  } finally {
    setEnabled();
  }
}

async function onDeriveKeys() {
  setSignStatus('Deriving...', 'pending');
  logStep('sign', 'Deriving receive[0] + change[0] keys from stored XPrv...');

  try {
    const ctx = walletService.getWalletContext();
    const keys = await deriveReceiveAndChange0({
      filename: demoState.walletFilename,
      password: $('walletPassword').value,
      networkId: demoState.networkId,
      accountIndex: ctx.currentAccountIndex ?? 0,
    });

    demoState.derivedKeys = keys;
    renderDerivedKeys();

    setSignStatus('Keys derived', 'connected');
    logStep('sign', `Derived receive[0]: ${keys.receive.address}`);
    logStep('sign', `Derived change[0]: ${keys.change.address}`);
  } catch (err) {
    demoState.derivedKeys = null;
    renderDerivedKeys();
    setSignStatus('Derive failed', 'disconnected');
    logStep('sign', `Derive failed: ${err?.message || String(err)}`);
    logStep('sign', 'Note: key derivation requires XPrv stored in IndexedDB for this filename/password.');
  } finally {
    setEnabled();
  }
}

async function onSign() {
  setSignStatus('Signing...', 'pending');
  logStep('sign', 'Signing PendingTransaction...');

  try {
    const keys = [];
    if (demoState.derivedKeys?.receive?.privateKey) keys.push(demoState.derivedKeys.receive.privateKey);
    if (demoState.derivedKeys?.change?.privateKey) keys.push(demoState.derivedKeys.change.privateKey);

    await signPendingTx({ pendingTx: demoState.pendingTx, keys });

    demoState.signed = true;
    setSignStatus('Signed', 'connected');
    logStep('sign', 'Signed OK.');
  } catch (err) {
    demoState.signed = false;
    setSignStatus('Sign failed', 'disconnected');
    logStep('sign', `Sign failed: ${err?.message || String(err)}`);
  } finally {
    setEnabled();
  }
}

async function onSubmit() {
  setSubmitStatus('Submitting...', 'pending');
  logStep('submit', 'Submitting transaction...');

  try {
    const { txid } = await submitPendingTx({ pendingTx: demoState.pendingTx, client: demoState.client });
    demoState.txid = txid;
    demoState.submitRes = { txid };

    setSubmitStatus('Submitted', 'connected');
    renderSubmit();

    logStep('submit', `Submitted txid: ${txid}`);

    // optional: refresh wallet balance after submit
    await refreshBalance();
  } catch (err) {
    setSubmitStatus('Submit failed', 'disconnected');
    demoState.submitRes = { error: err?.message || String(err) };
    renderSubmit();
    logStep('submit', `Submit failed: ${err?.message || String(err)}`);
  } finally {
    setEnabled();
  }
}

function wirePreConnectUi() {
  $('btnConnect').addEventListener('click', onConnectClick);
  // Nothing else is wired until Connect succeeds.
}

function wirePostConnectUiOnce() {
  if (postConnectWired) return;
  postConnectWired = true;

  $('btnWallet').addEventListener('click', onWalletClick);

  $('btnCopyReceive').addEventListener('click', async () => {
    if (!demoState.walletReceiveAddress) return;
    await copyText(demoState.walletReceiveAddress);
    logStep('wallet', 'Copied receive address to clipboard.');
  });

  $('btnFetchUtxos').addEventListener('click', onFetchUtxosClick);
  $('utxoSelectAll').addEventListener('change', onSelectAllChanged);

  $('btnAutoSelect').addEventListener('click', onAutoSelect);
  $('btnClearSelect').addEventListener('click', onClearSelect);

  $('btnEstimate').addEventListener('click', onEstimate);
  $('btnBuild').addEventListener('click', onBuild);
  $('btnDeriveKeys').addEventListener('click', onDeriveKeys);
  $('btnSign').addEventListener('click', onSign);
  $('btnSubmit').addEventListener('click', onSubmit);

  $('btnCopyTxid').addEventListener('click', async () => {
    if (!demoState.txid) return;
    await copyText(demoState.txid);
    logStep('submit', 'Copied txid to clipboard.');
  });

  $('btnClearLogs').addEventListener('click', () => {
    clearAllLogs();
    logStep('wallet', 'Logs cleared.');
  });

  $('btnExport').addEventListener('click', () => {
    const exportObj = {
      networkId: demoState.networkId,
      nodeUrl: demoState.nodeUrl,
      walletFilename: demoState.walletFilename,
      receiveAddress: demoState.walletReceiveAddress,
      changeAddress: demoState.walletChangeAddress,
      session: demoState.session,
      txid: demoState.txid,
      pendingTxSummary: demoState.pendingTxSummary,
    };

    downloadJson(`rapid_tx_session_${Date.now()}.json`, exportObj);
  });

  // Recompute selection coverage when target changes
  $('selectTargetKas').addEventListener('input', () => {
    computeSelectionFromOutpoints();
  });
}

function startUiAfterConnect() {
  // Any rendering that calls into WASM must happen only after Connect,
  // because WASM is initialized as part of the RPC connect flow.
  renderWalletInfo();
  renderUtxoStats();
  renderSelectionStats({ targetSompi: currentInputsTargetSompi() });
  renderPendingTx();
  renderDerivedKeys();
  renderSubmit();
}

function init() {
  wirePreConnectUi();
  setConnStatus(false);
  setWalletStatus('Not Ready', 'pending');
  setUtxoStatus('Not fetched', 'pending');
  setSelectStatus('None', 'pending');
  setBuildStatus('Not built', 'pending');
  setSignStatus('Not signed', 'pending');
  setSubmitStatus('Not submitted', 'pending');

  // Deliberately do not call any render* here (they use sompiToKaspaString).
  // Connect must be the first action that starts the app.
  renderWalletInfo();
  setEnabled();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
