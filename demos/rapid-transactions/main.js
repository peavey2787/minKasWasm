import { kaspaPortal, SearchMode } from "../../wrapper/kaspaPortal.js";
import { $, setStatus, setText, logLine, sleep } from "./dom.js";

const CONFIG = Object.freeze({
  networkId: "testnet-10",
  nodeUrl: null,
  walletFilename: "rapid_tx_wallet",
  walletPassword: "1234",
  sendAmountKas: "1",
  sendDelayMs: 200,
  payloadPrefix: "RT|",
  maxBacklog: 25,
  defaultEngines: 5,
  splitCount: 5,
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

  const ready = !!state.address && !!state.privateKeys;

  if (start) start.disabled = !ready || state.running;
  if (stop) stop.disabled = !state.running;
  if (split) split.disabled = !ready || state.running;
  if (analyze) analyze.disabled = !state.address;
  if (clearSpent) clearSpent.disabled = !state.address;

  setText("loopState", state.running ? "Running" : "Stopped");
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

    logLine(`[E${engineIndex}] Sent ${CONFIG.sendAmountKas} KAS → ${txid?.slice(0, 12)}…`);
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

  // Update engine count display on button
  $("engineCount")?.addEventListener("change", (e) => {
    const count = e.target.value;
    state.totalEngines = parseInt(count, 10);
    $("btnSplit").textContent = `Split UTXOs (${count})`;
  });
}

wireUi();
setLoopUi();

boot().catch((e) => {
  setStatus("Boot failed", "disconnected");
  logLine(`Boot failed: ${e?.message || String(e)}`);
});
