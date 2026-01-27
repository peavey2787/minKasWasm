import { KaspaPortal, SearchMode } from '../../wrapper/kaspaPortal.js';
import { $, setStatus, setText, logLine, sleep } from './dom.js';

const CONFIG = Object.freeze({
  networkId: 'testnet-10',
  nodeUrl: null,
  walletFilename: 'rapid_tx_wallet',
  walletPassword: '1234',
  sendAmountKas: '1',
  sendDelayMs: 800,
  payloadPrefix: 'RT|',
  maxBacklog: 25,
});

const state = {
  portal: new KaspaPortal(),
  address: null,
  running: false,
  sent: 0,
  received: 0,
  lastTxid: null,
  lastLatencyMs: null,
  // txid -> { sentAtMs, payload }
  pending: new Map(),
  payloadSeq: 0,
  backlog: [], // array of { tsMs, seq }
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
  // Always start with a stable prefix so the block scanner can match efficiently.
  // Format:
  // RT|Prior:<iso>:<n>;Prior:<iso>:<n>;Current:<iso>:<n>
  const parts = [];

  for (const m of state.backlog) {
    parts.push(formatMoveLine('Prior', m));
  }
  parts.push(formatMoveLine('Current', currentMove));

  return CONFIG.payloadPrefix + parts.join(';');
}

function extractTxId(sendRes) {
  if (!sendRes) return null;

  const direct = sendRes.transactionId || sendRes.txid || sendRes.txId || sendRes.finalTransactionId || sendRes.id;
  if (typeof direct === 'string' && direct.length > 10) return direct;

  const arr = sendRes.transactionIds || sendRes.txIds || sendRes.ids;
  if (Array.isArray(arr) && typeof arr[0] === 'string') return arr[0];

  const nested = sendRes?.summary?.finalTransactionId || sendRes?.summary?.transactionId;
  if (typeof nested === 'string' && nested.length > 10) return nested;

  return null;
}

function setLoopUi() {
  const start = $('btnStart');
  const stop = $('btnStop');
  if (start) start.disabled = !state.address || state.running;
  if (stop) stop.disabled = !state.running;
  setText('loopState', state.running ? 'Running' : 'Stopped');
}

async function refreshBalance() {
  try {
    const sompi = await state.portal.getBalance();
    // wallet_service also emits balance events, but polling keeps this demo simple.
    const kas = Number(sompi / 100000000n) + Number(sompi % 100000000n) / 1e8;
    const str = kas.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    setText('bal', `${str} KAS`);
  } catch (e) {
    logLine(`Balance refresh failed: ${e?.message || String(e)}`);
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

    setText('received', String(state.received));
    setText('latency', `${Math.round(latencyMs / 1000)}s`);

    const payloadInfo = m?.decodedPayload ? ` payload='${m.decodedPayload}'` : '';
    logLine(`Received in block: ${txid} (latency ${latencyMs}ms)${payloadInfo}`);
  }
}

async function startScanner() {
  if (!state.portal.client) throw new Error('Scanner start: client not ready.');
  if (!state.address) throw new Error('Scanner start: address not ready.');

  const scanner = state.portal.intelligence.scanner;
  if (scanner.scanning) {
    try { scanner.stop(); } catch { /* ignore */ }
  }

  scanner.prefix = CONFIG.payloadPrefix;
  scanner.searchMode = SearchMode.STARTS_WITH;
  scanner.addresses = [state.address];

  await scanner.start(onScannerBlock);
  logLine('Block scanner started.');
}

async function sendOnce() {
  if (!state.address) throw new Error('Send: address not ready.');

  // Create the next move payload.
  const currentMove = { tsMs: Date.now(), seq: ++state.payloadSeq };
  const payload = buildPayloadWithBacklog(currentMove);

  let sendRes;
  try {
    sendRes = await state.portal.send({
      amount: CONFIG.sendAmountKas,
      toAddress: state.address,
      payload,
      priorityFeeKas: 0,
    });
  } catch (err) {
    if (isInsufficientFundsError(err)) {
      // Preserve the move so it can be replayed by the receiver.
      state.backlog.push(currentMove);
      if (state.backlog.length > CONFIG.maxBacklog) {
        state.backlog.splice(0, state.backlog.length - CONFIG.maxBacklog);
      }

      logLine(`Insufficient funds. Backlogging move seq=${currentMove.seq} (backlog=${state.backlog.length}).`);
    }
    throw err;
  }

  const txid = extractTxId(sendRes);

  state.sent++;
  state.lastTxid = txid || '(unknown txid)';

  setText('sent', String(state.sent));
  setText('lastTxid', state.lastTxid);

  if (txid) state.pending.set(txid, { sentAtMs: Date.now(), payload });

  // Clear any backlog only after we have a txid (i.e., the send is real).
  // If txid is missing, keep backlog intact to be safe.
  if (txid && state.backlog.length > 0) {
    logLine(`Backlog flushed (${state.backlog.length} prior move(s)) into tx ${txid}.`);
    state.backlog = [];
  }

  logLine(`Sent ${CONFIG.sendAmountKas} KAS to self. txid=${state.lastTxid} payload='${payload}'`);
}

async function runLoop() {
  if (state.running) return;
  state.running = true;
  setLoopUi();

  logLine('Send loop started.');

  while (state.running) {
    try {
      await sendOnce();
    } catch (e) {
      logLine(`Send failed: ${e?.message || String(e)}`);
    }

    await refreshBalance();
    await sleep(CONFIG.sendDelayMs);
  }

  logLine('Send loop stopped.');
}

function stopLoop() {
  state.running = false;
  setLoopUi();
}

async function boot() {
  setText('net', CONFIG.networkId);
  setText('sent', '0');
  setText('received', '0');
  setText('lastTxid', '--');
  setText('latency', '--');

  setStatus('Connecting…', 'pending');
  logLine(`Connecting to ${CONFIG.networkId}…`);

  await state.portal.connect({ rpcUrl: CONFIG.nodeUrl, networkId: CONFIG.networkId, startIntelligence: false });

  setStatus('Opening wallet…', 'pending');
  logLine(`Opening/creating wallet '${CONFIG.walletFilename}'…`);

  const res = await state.portal.identity.createWallet({
    password: CONFIG.walletPassword,
    filename: CONFIG.walletFilename,
    discoverAddresses: false,
    storeMnemonic: false,
  });

  state.address = res?.address ? String(res.address) : null;
  if (!state.address) throw new Error('Wallet did not return a receive address.');

  setText('addr', state.address);

  await refreshBalance();
  await startScanner();

  setStatus('Ready', 'connected');
  logLine('Ready.');

  setLoopUi();
}

function wireUi() {
  $('btnStart')?.addEventListener('click', () => {
    runLoop().catch((e) => logLine(`Loop error: ${e?.message || String(e)}`));
  });
  $('btnStop')?.addEventListener('click', stopLoop);
}

wireUi();
setLoopUi();

boot().catch((e) => {
  setStatus('Boot failed', 'disconnected');
  logLine(`Boot failed: ${e?.message || String(e)}`);
});
