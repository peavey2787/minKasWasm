import { $, copyText, setBadge } from './dom.js';
import { clearLogs, logEvent, setEnabled, setWalletStatus } from './ui.js';
import { calibrateSendSpacing, connectAndStart, createWalletAndBind, exportResults, runTestAdvanced, stopTest } from './diagnostics.js';
import { diagState } from './state.js';

function readInputs() {
  return {
    networkId: $('networkId').value,
    nodeUrl: $('nodeUrl').value.trim(),
    prefix: $('prefix').value.trim() || 'anticheat:move',
    runMode: $('runMode')?.value || 'count',
    txCount: Number($('txCount').value || 25),
    runDurationMs: Number($('runDurationMs')?.value || 30000),
    txIntervalMs: Number($('txIntervalMs').value || 0),
    txTimeoutMs: Number($('txTimeoutMs').value || 45000),
    drainTimeoutMs: Number($('drainTimeoutMs')?.value || 10000),
    txAmountKas: $('txAmountKas').value.trim() || '0.2',
    stopOnSendFail: !!$('stopOnSendFail')?.checked,
    sendRetryCount: Number($('sendRetryCount')?.value || 0),
    sendRetryDelayMs: Number($('sendRetryDelayMs')?.value || 0),
  };
}

async function onConnect() {
  clearLogs();
  setWalletStatus('Not Ready', 'pending');
  const { networkId, nodeUrl, prefix } = readInputs();
  await connectAndStart({ networkId, nodeUrl, prefix });
  setEnabled({
    connected: diagState.connected,
    walletReady: diagState.walletReady,
    running: !!diagState.runAbort,
    hasResults: !!diagState.results,
    hasWalletAddress: !!diagState.walletAddress,
  });
}

async function onWallet() {
  await createWalletAndBind();
}

async function onCopyAddr() {
  if (!diagState.walletAddress) return;
  await copyText(diagState.walletAddress);
  logEvent('Copied wallet address');
}

async function onRun() {
  const {
    prefix,
    runMode,
    txCount,
    runDurationMs,
    txIntervalMs,
    txTimeoutMs,
    drainTimeoutMs,
    txAmountKas,
    stopOnSendFail,
    sendRetryCount,
    sendRetryDelayMs,
  } = readInputs();

  logEvent('Starting test…');

  await runTestAdvanced({
    prefix,
    runMode,
    count: txCount,
    durationMs: runDurationMs,
    intervalMs: txIntervalMs,
    timeoutMs: txTimeoutMs,
    drainTimeoutMs,
    amountKas: txAmountKas,
    stopOnSendFail,
    sendRetryCount,
    sendRetryDelayMs,
  });
}

function parseCandidatesMs(text) {
  return String(text || '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
}

async function onCalibrate() {
  const { prefix } = readInputs();
  const trialsPerCandidate = Number($('calibTrials')?.value || 8);
  const amountKas = $('calibAmountKas')?.value?.trim() || '0.00001';
  const candidatesMs = parseCandidatesMs($('calibCandidates')?.value);

  setBadge('calibStatus', 'Running', 'pending');
  const out = $('calibResult');
  if (out) out.textContent = '--';

  setEnabled({
    connected: diagState.connected,
    walletReady: diagState.walletReady,
    running: true,
    hasResults: !!diagState.results,
    hasWalletAddress: !!diagState.walletAddress,
  });

  try {
    const res = await calibrateSendSpacing({
      prefix,
      trialsPerCandidate,
      amountKas,
      candidatesMs: candidatesMs.length ? candidatesMs : undefined,
    });

    if (out) out.textContent = `${res.recommendedMinSpacingMs} ms`;
    setBadge('calibStatus', 'Done', 'connected');
    logEvent(`CALIB DONE: recommended minSpacingMs=${res.recommendedMinSpacingMs}`);
  } catch (e) {
    setBadge('calibStatus', 'Failed', 'disconnected');
    logEvent(`CALIB ERROR: ${e?.message ?? String(e)}`);
  } finally {
    setEnabled({
      connected: diagState.connected,
      walletReady: diagState.walletReady,
      running: !!diagState.runAbort,
      hasResults: !!diagState.results,
      hasWalletAddress: !!diagState.walletAddress,
    });
  }
}

function onStop() {
  stopTest();
}

function onExport() {
  exportResults();
}

$('btnConnect').addEventListener('click', onConnect);
$('btnWallet').addEventListener('click', onWallet);
$('btnCopyAddr').addEventListener('click', onCopyAddr);
$('btnRun').addEventListener('click', onRun);
$('btnStop').addEventListener('click', onStop);
$('btnExport').addEventListener('click', onExport);
$('btnCalibrate')?.addEventListener('click', onCalibrate);

setEnabled({
  connected: false,
  walletReady: false,
  running: false,
  hasResults: false,
  hasWalletAddress: false,
});
