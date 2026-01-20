import { diagState, resetRunStats, recordBlockTick } from './state.js';
import { logBlock, logEvent, setConnStatus, setEnabled, setRunStatus, setRunUiState, setWalletStatus, updateQueueStats, updateStats } from './ui.js';
import { safeJsonStringify } from './math.js';
import { connectClient, startScanner } from './kaspa_runtime.js';
import { initWallet, createOrLoadDemoWallet, sendPayloadTx, getWalletSendQueueStats, setWalletSendQueueDefaults } from './wallet_runtime.js';
import { makeDiagPayload, extractDecodedPayload, parseDiagSeq } from './payload.js';

const INDEXER_MATCH_EVENTS = new Set([
  'matching-transaction-in-memory',
  'matching-transaction-cached',
]);

function normalizeItems(data) {
  return Array.isArray(data) ? data : (data ? [data] : []);
}

function exportJson(results) {
  const blob = new Blob([safeJsonStringify(results)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `node_or_code_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function computeMissingUpTo(count) {
  let missing = 0;
  for (let seq = 0; seq < count; seq++) {
    if (diagState.sendDoneAtBySeq.has(seq) && !diagState.detectedAtBySeq.has(seq)) missing++;
  }
  return missing;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function median(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function calibrateSendSpacing({
  prefix,
  candidatesMs = [0, 50, 100, 150, 200, 250, 350, 500, 750, 1000, 1500],
  trialsPerCandidate = 8,
  amountKas = '0.00001',
} = {}) {
  if (!diagState.connected) throw new Error('Not connected');
  if (!diagState.walletReady || !diagState.walletAddress) throw new Error('Wallet not ready');
  if (diagState.runAbort) throw new Error('Stop the current run before calibrating');

  const toAddress = diagState.walletAddress;
  const startedAt = Date.now();
  const results = [];
  const trials = Math.max(1, Number(trialsPerCandidate || 0));

  logEvent(`CALIB: starting (trials=${trials}, amountKas=${String(amountKas)}, candidates=${candidatesMs.join(',')})`);

  for (const minSpacingMs of candidatesMs) {
    const ms = Math.max(0, Number(minSpacingMs));

    setWalletSendQueueDefaults({ minSpacingMs: ms });
    diagState.sendQueueMinSpacingMs = ms;

    logEvent(`CALIB: trying minSpacingMs=${ms}ms`);

    let ok = 0;
    let fail = 0;
    const sendElapsedMs = [];

    for (let i = 0; i < trials; i++) {
      const t0 = performance.now();
      const payload = makeDiagPayload({ prefix: `${prefix}:calib`, seq: i });
      try {
        await sendPayloadTx({ amountKas, toAddress, payload });
        ok++;
        sendElapsedMs.push(performance.now() - t0);
      } catch (e) {
        fail++;
        logEvent(`CALIB: FAIL spacing=${ms} trial=${i}: ${e?.message ?? String(e)}`);
      }
    }

    const row = {
      minSpacingMs: ms,
      ok,
      fail,
      okRate: ok / trials,
      medianSendMs: median(sendElapsedMs),
    };
    results.push(row);

    if (fail === 0 && ok > 0) {
      diagState.lastCalibration = {
        startedAt,
        finishedAt: Date.now(),
        recommendedMinSpacingMs: ms,
        trialsPerCandidate: trials,
        amountKas: String(amountKas),
        candidatesMs: [...candidatesMs],
        results,
      };

      logEvent(`CALIB: recommended minSpacingMs=${ms}ms (0 failures)`);
      setWalletSendQueueDefaults({ minSpacingMs: ms });
      return diagState.lastCalibration;
    }
  }

  const best = [...results].sort((a, b) => (b.okRate - a.okRate) || (a.minSpacingMs - b.minSpacingMs))[0] || null;
  const chosen = best?.minSpacingMs ?? diagState.sendQueueMinSpacingMs;

  diagState.lastCalibration = {
    startedAt,
    finishedAt: Date.now(),
    recommendedMinSpacingMs: chosen,
    trialsPerCandidate: trials,
    amountKas: String(amountKas),
    candidatesMs: [...candidatesMs],
    results,
    note: 'No spacing achieved 0 failures; chose best okRate.',
  };

  logEvent(`CALIB: no perfect spacing; best=${chosen}ms okRate=${best?.okRate ?? 0}`);
  setWalletSendQueueDefaults({ minSpacingMs: chosen });
  diagState.sendQueueMinSpacingMs = chosen;
  return diagState.lastCalibration;
}

let _queueStatsTimer = null;
function startQueueStatsPolling() {
  stopQueueStatsPolling();
  // Small polling loop so stats update even when no blocks/events are flowing.
  _queueStatsTimer = setInterval(() => {
    try {
      const s = getWalletSendQueueStats?.();
      updateQueueStats({
        depth: s?.depth,
        retries: s?.retried,
        lastError: s?.lastError,
      });
    } catch {
      // ignore
    }
  }, 500);
}

function stopQueueStatsPolling() {
  if (_queueStatsTimer) {
    clearInterval(_queueStatsTimer);
    _queueStatsTimer = null;
  }
}

async function handleIndexerUpdate(evt, { prefix }) {
  if (!evt?.type) return;

  // Block-rate measurement: handle common patterns without depending on internal naming.
  if (String(evt.type).toLowerCase().includes('block')) {
    recordBlockTick();
    const first = normalizeItems(evt.data)[0];
    const bs = first?.header?.blueScore ?? first?.blueScore;
    const hash = first?.header?.hash ?? first?.hash;
    if (hash) {
      logBlock(`BLOCK bs=${typeof bs === 'bigint' ? bs.toString() : String(bs ?? '?')} hash=${String(hash).slice(0, 20)}...`);
    }
    updateStats(diagState);
  }

  if (!INDEXER_MATCH_EVENTS.has(evt.type)) return;

  const items = normalizeItems(evt.data);
  for (const matchObj of items) {
    const payload = extractDecodedPayload(matchObj);
    if (!payload) {
      diagState.noDecoded += 1;
      continue;
    }

    const seq = parseDiagSeq(payload, prefix);
    if (seq == null) continue;

    if (diagState.detectedAtBySeq.has(seq)) continue;
    diagState.detectedAtBySeq.set(seq, performance.now());
    diagState.detected += 1;

    const sendDoneAt = diagState.sendDoneAtBySeq.get(seq);
    if (typeof sendDoneAt === 'number') {
      diagState.latencies.push(Math.max(0, performance.now() - sendDoneAt));
    }

    logEvent(`DETECTED seq=${seq} txid=${String(matchObj?.txid ?? '').slice(0, 16)}...`);
  }

  updateStats(diagState);
}

export async function connectAndStart({ networkId, nodeUrl, prefix }) {
  setRunStatus('Idle', 'pending');
  setRunUiState({ running: false, badgeText: 'Stopped', badgeClass: 'pending', statusText: 'Idle' });
  setConnStatus(false);
  updateQueueStats({ depth: '--', retries: '--', lastError: null });
  stopQueueStatsPolling();

  diagState.networkId = networkId;
  diagState.nodeUrl = nodeUrl || null;

  try {
    diagState.client = await connectClient({ nodeUrl: diagState.nodeUrl, networkId });

    diagState.scanner = await startScanner({
      client: diagState.client,
      prefix,
      onIndexerUpdate: (evt) => handleIndexerUpdate(evt, { prefix }),
    });

    initWallet({
      rpcClient: diagState.client,
      networkId,
      onLog: (line) => logEvent(`[wallet] ${line}`),
      onBalanceChange: (kasStr) => {
        diagState.walletBalanceMature = kasStr;
        const el = document.getElementById('walletBalance');
        if (el) el.textContent = kasStr;
      },
    });

    startQueueStatsPolling();

    diagState.connected = true;
    setConnStatus(true);
    logEvent(`Connected. network=${networkId} url=${diagState.nodeUrl ?? '(resolver)'}`);
  } catch (e) {
    diagState.connected = false;
    setConnStatus(false);
    stopQueueStatsPolling();
    logEvent(`Connect failed: ${e?.message ?? String(e)}`);
  }

  setEnabled({
    connected: diagState.connected,
    walletReady: diagState.walletReady,
    running: !!diagState.runAbort,
    hasResults: !!diagState.results,
    hasWalletAddress: !!diagState.walletAddress,
  });
}

export async function createWalletAndBind() {
  try {
    setWalletStatus('Working...', 'pending');
    const res = await createOrLoadDemoWallet();
    diagState.walletAddress = res.address;
    diagState.walletReady = true;
    document.getElementById('walletAddress').value = diagState.walletAddress;
    setWalletStatus('Ready', 'connected');
    logEvent(`Wallet ready: ${diagState.walletAddress}`);
  } catch (e) {
    diagState.walletReady = false;
    setWalletStatus('Failed', 'disconnected');
    logEvent(`Wallet create/load failed: ${e?.message ?? String(e)}`);
  }

  setEnabled({
    connected: diagState.connected,
    walletReady: diagState.walletReady,
    running: !!diagState.runAbort,
    hasResults: !!diagState.results,
    hasWalletAddress: !!diagState.walletAddress,
  });
}

export async function runTest({ prefix, count, intervalMs, timeoutMs, amountKas }) {
  if (!diagState.walletReady || !diagState.walletAddress) return;

  // Back-compat wrapper: keep old signature by treating as count-mode.
  return await runTestAdvanced({
    prefix,
    runMode: 'count',
    count,
    durationMs: 0,
    intervalMs,
    timeoutMs,
    drainTimeoutMs: 0,
    amountKas,
    stopOnSendFail: false,
    sendRetryCount: 0,
    sendRetryDelayMs: 0,
  });
}

export async function runTestAdvanced({
  prefix,
  runMode,
  count,
  durationMs,
  intervalMs,
  timeoutMs,
  drainTimeoutMs,
  amountKas,
  stopOnSendFail,
  sendRetryCount,
  sendRetryDelayMs,
}) {
  if (!diagState.walletReady || !diagState.walletAddress) return;

  resetRunStats();
  diagState.runAbort = new AbortController();

  setRunUiState({ running: true, badgeText: 'Running', badgeClass: 'connected', statusText: 'Sending…' });
  setRunStatus('Running', 'connected');
  updateStats(diagState);

  setEnabled({
    connected: diagState.connected,
    walletReady: diagState.walletReady,
    running: true,
    hasResults: false,
    hasWalletAddress: !!diagState.walletAddress,
  });

  logEvent('How it works: we send payload txs with an incrementing seq, and mark DETECTED when the indexer emits a matching tx whose decoded payload contains that seq. Missing = send OK but not detected before the wait window ends.');
  logEvent('NOTE: send retries are handled by wallet_service send-queue (maxAttempts=5, minSpacingMs=250ms).');
  logEvent(`RUN: mode=${runMode} count=${count} durationMs=${durationMs} intervalMs=${intervalMs} timeoutMs=${timeoutMs} drainMs=${drainTimeoutMs} stopOnFail=${!!stopOnSendFail}`);

  const start = performance.now();
  let seq = 0;

  const shouldContinue = () => !diagState.runAbort.signal.aborted;

  const sendOne = async (seqToSend) => {
    diagState.sent += 1;
    updateStats(diagState);
    setRunUiState({ running: true, badgeText: 'Running', badgeClass: 'connected', statusText: `Sending seq=${seqToSend}${runMode === 'count' ? `/${count - 1}` : ''}…` });

    const payload = makeDiagPayload({ prefix, seq: seqToSend });

    try {
      await sendPayloadTx({ amountKas, toAddress: diagState.walletAddress, payload });
      diagState.sendOk += 1;
      diagState.sendDoneAtBySeq.set(seqToSend, performance.now());
      logEvent(`SEND OK seq=${seqToSend}`);
      return true;
    } catch (e) {
      logEvent(`SEND FAIL seq=${seqToSend}: ${e?.message ?? String(e)}`);
      if (stopOnSendFail) {
        logEvent('Stopping due to stopOnSendFail=true');
        diagState.runAbort.abort();
      }
      return false;
    } finally {
      updateStats(diagState);
    }
  };

  if (runMode === 'count') {
    for (seq = 0; seq < count && shouldContinue(); seq++) {
      await sendOne(seq);
      if (!shouldContinue()) break;
      if (intervalMs > 0) await sleep(intervalMs);
      else await sleep(0);
    }
  } else if (runMode === 'duration') {
    const dur = Math.max(0, Number(durationMs || 0));
    while (shouldContinue() && (performance.now() - start) < dur) {
      await sendOne(seq);
      seq += 1;
      if (!shouldContinue()) break;
      if (intervalMs > 0) await sleep(intervalMs);
      else await sleep(0);
    }
  } else if (runMode === 'forever') {
    while (shouldContinue()) {
      await sendOne(seq);
      seq += 1;
      if (!shouldContinue()) break;
      if (intervalMs > 0) await sleep(intervalMs);
      else await sleep(0);
    }
  } else {
    logEvent(`Unknown runMode=${runMode}. Using count.`);
    for (seq = 0; seq < count && shouldContinue(); seq++) {
      await sendOne(seq);
      if (intervalMs > 0) await sleep(intervalMs);
      else await sleep(0);
    }
  }

  // Wait for detections
  setRunUiState({ running: true, badgeText: 'Waiting', badgeClass: 'pending', statusText: 'Waiting for detections…' });
  setRunStatus('Waiting', 'pending');

  const waitStart = performance.now();
  while (shouldContinue()) {
    const elapsed = performance.now() - waitStart;
    if (diagState.detectedAtBySeq.size >= diagState.sendOk) break;
    if (elapsed > Number(timeoutMs || 0)) break;
    setRunUiState({ running: true, badgeText: 'Waiting', badgeClass: 'pending', statusText: `Detected ${diagState.detectedAtBySeq.size}/${diagState.sendOk}…` });
    await sleep(250);
  }

  // Optional drain after stop to capture just-arriving events
  if (!shouldContinue() && Number(drainTimeoutMs || 0) > 0) {
    const drainStart = performance.now();
    setRunUiState({ running: true, badgeText: 'Stopping', badgeClass: 'pending', statusText: `Draining ${drainTimeoutMs}ms…` });
    setRunStatus('Stopping', 'pending');
    while ((performance.now() - drainStart) < Number(drainTimeoutMs)) {
      await sleep(200);
    }
  }

  // Compute missing only for seqs that actually sent OK
  let missing = 0;
  for (const seqKey of diagState.sendDoneAtBySeq.keys()) {
    if (!diagState.detectedAtBySeq.has(seqKey)) missing += 1;
  }
  diagState.missing = missing;
  updateStats(diagState);

  diagState.results = {
    networkId: diagState.networkId,
    nodeUrl: diagState.nodeUrl,
    prefix,
    runMode,
    count,
    durationMs: Number(durationMs || 0),
    intervalMs: Number(intervalMs || 0),
    timeoutMs: Number(timeoutMs || 0),
    drainTimeoutMs: Number(drainTimeoutMs || 0),
    amountKas: String(amountKas),
    stopOnSendFail: !!stopOnSendFail,
    sendRetryCount: Number(sendRetryCount || 0),
    sendRetryDelayMs: Number(sendRetryDelayMs || 0),
    sent: diagState.sent,
    sendOk: diagState.sendOk,
    detected: diagState.detected,
    missing: diagState.missing,
    noDecoded: diagState.noDecoded,
    latenciesMs: diagState.latencies,
    endedAt: new Date().toISOString(),
  };

  logEvent(`DONE: sendOk=${diagState.sendOk} detected=${diagState.detected} missing=${diagState.missing}`);

  diagState.runAbort = null;
  setRunUiState({ running: false, badgeText: 'Stopped', badgeClass: 'connected', statusText: 'Done' });
  setRunStatus('Done', 'connected');
  setEnabled({
    connected: diagState.connected,
    walletReady: diagState.walletReady,
    running: false,
    hasResults: true,
    hasWalletAddress: !!diagState.walletAddress,
  });

  return diagState.results;
}

export function stopTest() {
  if (diagState.runAbort) diagState.runAbort.abort();
  diagState.runAbort = null;
  stopQueueStatsPolling();
  setRunStatus('Stopped', 'disconnected');
  setRunUiState({ running: false, badgeText: 'Stopped', badgeClass: 'disconnected', statusText: 'Stopped' });
  setEnabled({
    connected: diagState.connected,
    walletReady: diagState.walletReady,
    running: false,
    hasResults: !!diagState.results,
    hasWalletAddress: !!diagState.walletAddress,
  });

  logEvent('STOP requested');
}

export function exportResults() {
  if (!diagState.results) return;
  exportJson(diagState.results);
}
