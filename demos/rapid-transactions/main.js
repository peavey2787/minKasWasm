import { kaspaPortal, SearchMode } from "../../wrapper/kaspaPortal.js";
import { $, setStatus, setText, logLine, sleep } from "./dom.js";

const CONFIG = Object.freeze({
  networkId: "testnet-10",
  nodeUrl: null,
  walletFilename: "rapid_tx_wallet",
  walletPassword: "1234",
  sendAmountKas: "0.5",
  sendDelayMs: 200,
  payloadPrefix: "RT|",
  maxBacklog: 25,
  defaultEngines: 5,
  splitCount: 5,
  // Heartbeat settings - monitors USABLE UTXOs (not just total count)
  heartbeatIntervalMs: 15000, // Check every 15 seconds (fast response to low UTXOs)
  heartbeatThresholdMultiplier: 5, // threshold = engines × multiplier (need enough for slot distribution)
  heartbeatSplitMultiplier: 3, // splitCount = engines × multiplier
  usableThresholdKas: 1, // Minimum KAS for a UTXO to be "usable" (must cover send + fees)
  maxSmallUtxos: 30, // Trigger consolidation when small UTXO count exceeds this
});

const state = {
  portal: kaspaPortal,
  address: null,
  running: false,
  sent: 0,
  received: 0,
  lastTxid: null,
  lastLatencyMs: null,
  pending: new Map(),   // txid -> { sentAtMs, payload, engine }
  payloadSeq: 0,
  backlog: [],
  // Multi-engine state
  privateKeys: null,
  totalEngines: CONFIG.defaultEngines,
  errors: 0,
  latencies: [],        // last 100 latencies for avg calculation
  startTime: null,      // for TX/sec calculation
  // Heartbeat state
  heartbeatEnabled: true,
};

function isInsufficientFundsError(err) {
  const msg = err?.message || String(err);
  return /insufficient funds/i.test(msg);
}

function formatMoveLine(prefix, move) {
  const ts = new Date(move.tsMs).toISOString();
  return `${prefix}:${ts}:${move.seq}`;
}

function buildPayloadWithBacklog(currentMove) {
  const parts = [];
  for (const m of state.backlog) {
    parts.push(formatMoveLine("Prior", m));
  }
  parts.push(formatMoveLine("Current", currentMove));
  return CONFIG.payloadPrefix + parts.join(";");
}

function extractTxId(sendRes) {
  if (!sendRes) return null;

  const direct =
    sendRes.transactionId ||
    sendRes.txid ||
    sendRes.txId ||
    sendRes.finalTransactionId ||
    sendRes.id;
  if (typeof direct === "string" && direct.length > 10) return direct;

  const arr = sendRes.transactionIds || sendRes.txIds || sendRes.ids;
  if (Array.isArray(arr) && typeof arr[0] === "string") return arr[0];

  const nested =
    sendRes?.summary?.finalTransactionId || sendRes?.summary?.transactionId;
  if (typeof nested === "string" && nested.length > 10) return nested;

  return null;
}

function updateStats() {
  setText("sent", String(state.sent));
  setText("received", String(state.received));
  setText("pendingCount", String(state.pending.size));
  setText("errorCount", String(state.errors));

  if (state.latencies.length > 0) {
    const avg = state.latencies.reduce((a, b) => a + b, 0) / state.latencies.length;
    setText("avgLatency", `${Math.round(avg)}ms`);
  }

  if (state.startTime && state.sent > 0) {
    const elapsed = (Date.now() - state.startTime) / 1000;
    const txPerSec = state.sent / elapsed;
    setText("txPerSec", txPerSec.toFixed(2));
  }
}

function setLoopUi() {
  const start = $("btnStart");
  const stop = $("btnStop");
  const split = $("btnSplit");
  const analyze = $("btnAnalyze");
  const clearSpent = $("btnClearSpent");
  const consolidate = $("btnConsolidate");
  const heartbeat = $("btnHeartbeat");

  const ready = !!state.address && !!state.privateKeys;

  if (start) start.disabled = !ready || state.running;
  if (stop) stop.disabled = !state.running;
  if (split) split.disabled = !ready || state.running;
  if (analyze) analyze.disabled = !state.address;
  if (clearSpent) clearSpent.disabled = !state.address;
  if (consolidate) consolidate.disabled = !ready || state.running;
  if (heartbeat) heartbeat.disabled = !ready;

  setText("loopState", state.running ? "Running" : "Stopped");
  updateHeartbeatUI();
}

async function refreshBalance() {
  try {
    const sompi = await state.portal.getBalance();
    const kas = Number(sompi / 100000000n) + Number(sompi % 100000000n) / 1e8;
    const str = kas.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    setText("bal", `${str} KAS`);
  } catch (e) {
    logLine(`Balance refresh failed: ${e?.message || String(e)}`);
  }
}

async function analyzeUtxos() {
  if (!state.address) return;

  try {
    const analysis = await state.portal.analyzeUtxos(state.address);
    setText("utxoCount", String(analysis.utxoCount));
    setText("utxoLarge", String(analysis.categories.large.count));
    setText("utxoMedium", String(analysis.categories.medium.count));
    setText("utxoSmall", String(analysis.categories.small.count + analysis.categories.dust.count));

    logLine(`UTXOs: ${analysis.utxoCount} total (${analysis.categories.large.count} large, ${analysis.categories.medium.count} medium, ${analysis.categories.small.count} small, ${analysis.categories.dust.count} dust)`);
  } catch (e) {
    logLine(`UTXO analysis failed: ${e?.message || String(e)}`);
  }
}

async function splitUtxos() {
  if (!state.address || !state.privateKeys) {
    logLine("Cannot split: wallet not ready.");
    return;
  }

  setStatus("Splitting UTXOs…", "pending");
  logLine(`Splitting UTXOs into ${CONFIG.splitCount} equal parts…`);

  try {
    const result = await state.portal.splitUtxos({
      address: state.address,
      splitCount: CONFIG.splitCount,
      privateKeys: state.privateKeys,
      priorityFee: 0n,
    });

    logLine(`Split successful! txid=${result.transactionId}`);
    logLine(`Created ${result.outputCount} UTXOs of ~${result.amountPerOutput} KAS each`);

    // Refresh after split
    await sleep(1000);
    await refreshBalance();
    await analyzeUtxos();

    setStatus("Ready", "connected");
  } catch (e) {
    logLine(`Split failed: ${e?.message || String(e)}`);
    setStatus("Split failed", "disconnected");
  }
}

function clearSpentCache() {
  if (!state.address) return;

  state.portal.clearSpentUtxos();
  state.portal.invalidateUtxoCache(state.address);
  logLine("Spent UTXO cache cleared.");
}

// ─────────────────────────────────────────────────────────────
// Heartbeat - Automatic UTXO Replenishment
// ─────────────────────────────────────────────────────────────

function startHeartbeat() {
  if (!state.address || !state.privateKeys) {
    logLine("Cannot start heartbeat: wallet not ready.");
    return;
  }

  const engines = parseInt($("engineCount")?.value || state.totalEngines, 10);
  const targetUtxoCount = engines * CONFIG.heartbeatThresholdMultiplier;

  // Split into enough UTXOs so each engine has multiple slots
  const splitCount = engines * (CONFIG.heartbeatSplitMultiplier || 3);

  // Convert usable threshold to sompi
  const usableThreshold = BigInt(Math.floor((CONFIG.usableThresholdKas || 1) * 100000000));

  state.portal.startHeartbeat({
    address: state.address,
    privateKeys: state.privateKeys,
    intervalMs: CONFIG.heartbeatIntervalMs,
    targetUtxoCount,
    splitCount,
    priorityFee: 0n,
    usableThreshold,
    autoConsolidate: true,
    maxSmallUtxos: CONFIG.maxSmallUtxos || 30,
    onCheck: ({ usableCount, smallCount, targetUtxoCount }) => {
      // Show USABLE count and small count - this is the key metric!
      let status;
      if (usableCount === 0 && smallCount > 0) {
        status = `🔴 CRITICAL (0/${targetUtxoCount}, ${smallCount} small)`;
      } else if (usableCount < targetUtxoCount) {
        status = `⚡ LOW (${usableCount}/${targetUtxoCount}, ${smallCount} small)`;
      } else {
        status = `✓ OK (${usableCount}/${targetUtxoCount})`;
      }
      setText("heartbeatStatus", status);
    },
    onSplit: async ({ previousCount, newCount, transactionId }) => {
      logLine(`💓 Heartbeat split: ${previousCount} → ${newCount} usable UTXOs, txid=${transactionId?.slice(0, 12)}…`);
      // Refresh UTXO display after a short delay for confirmation
      await sleep(1000);
      await analyzeUtxos();
    },
    onConsolidate: async ({ previousCount, newCount, transactionId, emergency }) => {
      const prefix = emergency ? "🚨 EMERGENCY" : "🧹";
      logLine(`${prefix} Heartbeat consolidate: ${previousCount} → ${newCount} UTXOs, txid=${transactionId?.slice(0, 12)}…`);
      await sleep(1000);
      await analyzeUtxos();
    },
    onError: ({ type, error, emergency }) => {
      const prefix = emergency ? "🚨" : "💔";
      logLine(`${prefix} Heartbeat ${type} error: ${error?.message || error}`);
    },
  });

  state.heartbeatEnabled = true;
  updateHeartbeatUI();
  logLine(
    `💓 Heartbeat started: every ${CONFIG.heartbeatIntervalMs / 1000}s, ` +
    `need ${targetUtxoCount} usable UTXOs (>= ${CONFIG.usableThresholdKas} KAS), ` +
    `auto-consolidate if >${CONFIG.maxSmallUtxos} small`
  );
}

function stopHeartbeat() {
  state.portal.stopHeartbeat();
  state.heartbeatEnabled = false;
  updateHeartbeatUI();
  setText("heartbeatStatus", "Stopped");
  logLine("💔 Heartbeat stopped.");
}

function toggleHeartbeat() {
  if (state.portal.isHeartbeatRunning) {
    stopHeartbeat();
  } else {
    startHeartbeat();
  }
}

function updateHeartbeatUI() {
  const btn = $("btnHeartbeat");
  if (btn) {
    btn.textContent = state.portal.isHeartbeatRunning ? "Stop Heartbeat" : "Start Heartbeat";
    btn.classList.toggle("active", state.portal.isHeartbeatRunning);
  }
}

async function consolidateUtxos() {
  if (!state.address || !state.privateKeys) {
    logLine("Cannot consolidate: wallet not ready.");
    return;
  }

  setStatus("Consolidating UTXOs…", "pending");
  logLine("Consolidating small/medium UTXOs into large ones…");
  logLine("(This may take multiple rounds for large UTXO counts)");

  try {
    const result = await state.portal.consolidateUtxos({
      address: state.address,
      privateKeys: state.privateKeys,
      targetCount: CONFIG.splitCount, // Consolidate into 5 large UTXOs
      priorityFee: 0n,
      onProgress: ({ round, estimatedRounds, txid, inputCount, outputCount }) => {
        logLine(`Round ${round}: Merged ${inputCount} → ${outputCount} UTXO(s), txid=${txid?.slice(0, 12)}…`);
        setStatus(`Consolidating… Round ${round}`, "pending");
      },
    });

    if (result.rounds > 1) {
      logLine(`Consolidation complete in ${result.rounds} rounds!`);
    } else {
      logLine(`Consolidation successful! txid=${result.transactionId?.slice(0, 16)}…`);
    }

    logLine(`Result: ${result.previousUtxoCount} UTXOs → ${result.finalUtxoCount} UTXOs`);
    logLine(`Each output: ~${result.amountPerOutput} KAS`);

    // Refresh after consolidation
    await sleep(1000);
    await refreshBalance();
    await analyzeUtxos();

    setStatus("Ready", "connected");
  } catch (e) {
    logLine(`Consolidation failed: ${e?.message || String(e)}`);
    setStatus("Consolidation failed", "disconnected");
  }
}

function onScannerBlock(_block, matches) {
  if (!Array.isArray(matches) || matches.length === 0) return;

  for (const m of matches) {
    const txid = m?.txid;
    if (!txid) continue;

    const pending = state.pending.get(txid);
    if (!pending) continue;

    state.pending.delete(txid);
    state.received++;

    const latencyMs = Date.now() - pending.sentAtMs;
    state.lastLatencyMs = latencyMs;

    // Track latencies for average (keep last 100)
    state.latencies.push(latencyMs);
    if (state.latencies.length > 100) state.latencies.shift();

    setText("received", String(state.received));
    setText("latency", `${Math.round(latencyMs)}ms`);

    const payloadInfo = m?.decodedPayload ? ` payload='${m.decodedPayload}'` : "";
    logLine(`[E${pending.engine}] Received: ${txid.slice(0, 12)}… (${latencyMs}ms)${payloadInfo}`);

    updateStats();
  }
}

async function startScanner() {
  if (!state.portal.client) throw new Error("Scanner start: client not ready.");
  if (!state.address) throw new Error("Scanner start: address not ready.");

  const scanner = state.portal.intelligence.scanner;
  if (scanner.scanning) {
    try { scanner.stop(); } catch { /* ignore */ }
  }

  scanner.prefix = CONFIG.payloadPrefix;
  scanner.searchMode = SearchMode.STARTS_WITH;
  scanner.addresses = [state.address];

  await scanner.start(onScannerBlock);
  logLine("Block scanner started.");
}

async function sendWithEngine(engineIndex) {
  if (!state.address || !state.privateKeys) {
    throw new Error("Send: wallet not ready.");
  }

  const currentMove = { tsMs: Date.now(), seq: ++state.payloadSeq };
  const payload = buildPayloadWithBacklog(currentMove);

  const delayMs = parseInt($("sendDelay")?.value || CONFIG.sendDelayMs, 10);
  const engines = parseInt($("engineCount")?.value || state.totalEngines, 10);

  try {
    const result = await state.portal.manualSend({
      fromAddress: state.address,
      toAddress: state.address,
      amount: CONFIG.sendAmountKas,
      payload,
      privateKeys: state.privateKeys,
      priorityFee: 0n,
      engineIndex,
      totalEngines: engines,
      optimisticSpend: true,
      janitorMode: true, // Enable automatic dust consolidation
    });

    const txid = result.transactionId;
    state.sent++;
    state.lastTxid = txid || "(unknown)";

    setText("sent", String(state.sent));
    setText("lastTxid", state.lastTxid);

    if (txid) {
      state.pending.set(txid, { sentAtMs: Date.now(), payload, engine: engineIndex });
    }

    if (txid && state.backlog.length > 0) {
      logLine(`Backlog flushed (${state.backlog.length} moves) into tx ${txid.slice(0, 12)}…`);
      state.backlog = [];
    }

    // Build status line with janitor info
    const statusParts = [];

    // Janitor sweep info
    if (result.isJanitorRun) {
      statusParts.push(`🧹${result.consolidatedCount}`);
    }

    const statusInfo = statusParts.length > 0 ? ` ${statusParts.join(" ")}` : "";

    logLine(`[E${engineIndex}] Sent ${CONFIG.sendAmountKas} KAS → ${txid?.slice(0, 12)}…${statusInfo}`);
    updateStats();

  } catch (err) {
    state.errors++;
    updateStats();

    if (isInsufficientFundsError(err)) {
      state.backlog.push(currentMove);
      if (state.backlog.length > CONFIG.maxBacklog) {
        state.backlog.splice(0, state.backlog.length - CONFIG.maxBacklog);
      }
      logLine(`[E${engineIndex}] Insufficient funds. Backlog=${state.backlog.length}`);
    } else {
      logLine(`[E${engineIndex}] Send failed: ${err?.message || String(err)}`);
    }
    throw err;
  }
}

async function runEngine(engineIndex) {
  const delayMs = parseInt($("sendDelay")?.value || CONFIG.sendDelayMs, 10);

  while (state.running) {
    try {
      await sendWithEngine(engineIndex);
    } catch (e) {
      // Error already logged in sendWithEngine
    }
    await sleep(delayMs);
  }
}

async function runLoop() {
  if (state.running) return;

  state.running = true;
  state.startTime = Date.now();
  state.sent = 0;
  state.received = 0;
  state.errors = 0;
  state.latencies = [];
  state.pending.clear();

  setLoopUi();
  updateStats();

  const engines = parseInt($("engineCount")?.value || state.totalEngines, 10);
  logLine(`Starting ${engines} engine(s)…`);

  // Start all engines in parallel
  const enginePromises = [];
  for (let i = 0; i < engines; i++) {
    enginePromises.push(runEngine(i));
  }

  // Wait for all engines to complete (they'll exit when state.running = false)
  await Promise.all(enginePromises);

  logLine("All engines stopped.");
}

function stopLoop() {
  state.running = false;
  setLoopUi();
  logLine("Stopping engines…");
}

async function boot() {
  setText("net", CONFIG.networkId);
  setText("sent", "0");
  setText("received", "0");
  setText("lastTxid", "--");
  setText("latency", "--");
  setText("utxoCount", "--");
  setText("utxoLarge", "--");
  setText("utxoMedium", "--");
  setText("utxoSmall", "--");
  setText("pendingCount", "0");
  setText("errorCount", "0");
  setText("avgLatency", "--");
  setText("txPerSec", "--");

  setStatus("Connecting…", "pending");
  logLine(`Connecting to ${CONFIG.networkId}…`);

  await state.portal.init();

  await state.portal.connect({
    rpcUrl: CONFIG.nodeUrl,
    networkId: CONFIG.networkId,
    startIntelligence: false,
    balanceElementId: 'bal',
  });

  setStatus("Opening wallet…", "pending");
  logLine(`Opening/creating wallet '${CONFIG.walletFilename}'…`);

  const res = await state.portal.createOrOpenWallet({
    password: CONFIG.walletPassword,
    walletFilename: CONFIG.walletFilename,
    storeMnemonic: false,
  });

  state.address = res?.address ? String(res.address) : null;
  if (!state.address) throw new Error("Wallet did not return a receive address.");

  setText("addr", state.address);

  // Extract private keys for manual transaction building
  try {
    const privateKeysResult = await state.portal.getPrivateKeys({ keyCount: 10, changeKeyCount: 5 });
    if (privateKeysResult && privateKeysResult.length > 0) {
      state.privateKeys = privateKeysResult;
      logLine(`Extracted ${privateKeysResult.length} private key(s) for manual TX building.`);
    } else {
      logLine("Warning: No private keys available. Manual send disabled.");
    }
  } catch (e) {
    logLine(`Warning: Could not extract private keys: ${e?.message || String(e)}`);
  }

  await refreshBalance();
  await analyzeUtxos();
  await startScanner();

  // Start heartbeat for automatic UTXO replenishment
  if (state.heartbeatEnabled && state.privateKeys?.length) {
    startHeartbeat();
  }

  setStatus("Ready", "connected");
  logLine("Ready. Split UTXOs first for parallel sending.");

  setLoopUi();
}

function wireUi() {
  $("btnStart")?.addEventListener("click", () => {
    runLoop().catch((e) => logLine(`Loop error: ${e?.message || String(e)}`));
  });
  $("btnStop")?.addEventListener("click", stopLoop);
  $("btnSplit")?.addEventListener("click", () => {
    splitUtxos().catch((e) => logLine(`Split error: ${e?.message || String(e)}`));
  });
  $("btnAnalyze")?.addEventListener("click", () => {
    analyzeUtxos().catch((e) => logLine(`Analyze error: ${e?.message || String(e)}`));
  });
  $("btnClearSpent")?.addEventListener("click", clearSpentCache);
  $("btnConsolidate")?.addEventListener("click", () => {
    consolidateUtxos().catch((e) => logLine(`Consolidate error: ${e?.message || String(e)}`));
  });
  $("btnHeartbeat")?.addEventListener("click", toggleHeartbeat);

  // Update engine count display on button
  $("engineCount")?.addEventListener("change", (e) => {
    const count = e.target.value;
    state.totalEngines = parseInt(count, 10);
    $("btnSplit").textContent = `Split UTXOs (${count})`;

    // Restart heartbeat with new threshold if running
    if (state.portal.isHeartbeatRunning) {
      stopHeartbeat();
      startHeartbeat();
    }
  });
}

wireUi();
setLoopUi();

boot().catch((e) => {
  setStatus("Boot failed", "disconnected");
  logLine(`Boot failed: ${e?.message || String(e)}`);
});
