// vrf_sources.js - VRF data fetching and folding
// Uses the global kaspaPortal singleton exclusively

import { $ } from './dom_elements.js';
import { state, portal } from './state.js';
import { log, downloadJSON, hexToBinary } from './utils.js';

function clampByte(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  if (x < 0 || x > 255) return null;
  return x | 0;
}

function hexToBytes(hex) {
  const clean = String(hex).trim().replace(/^0x/i, '').replace(/\s+/g, '');
  if (!clean) return [];
  if (!/^[0-9a-fA-F]+$/.test(clean)) throw new Error('Manual QRNG hex contains non-hex characters');
  const padded = clean.length % 2 === 1 ? '0' + clean : clean;
  const out = [];
  for (let i = 0; i < padded.length; i += 2) {
    out.push(parseInt(padded.slice(i, i + 2), 16));
  }
  return out;
}

function base64ToBytes(b64) {
  const clean = String(b64).trim().replace(/\s+/g, '');
  if (!clean) return [];
  // atob throws on invalid input
  const bin = atob(clean);
  const out = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

function parseManualQrng(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;

  // JSON array of numbers
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error('Manual QRNG JSON must be an array');
    const bytes = [];
    for (const v of arr) {
      const b = clampByte(v);
      if (b === null) throw new Error('Manual QRNG JSON array must contain bytes 0..255');
      bytes.push(b);
    }
    return bytes;
  }

  // Comma-separated bytes
  if (raw.includes(',') && /^[0-9\s,]+$/.test(raw)) {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const bytes = [];
    for (const p of parts) {
      const b = clampByte(p);
      if (b === null) throw new Error('Manual QRNG comma list must contain bytes 0..255');
      bytes.push(b);
    }
    return bytes;
  }

  // Hex string (allow 0x prefix)
  if (/^(0x)?[0-9a-fA-F\s]+$/.test(raw) && raw.replace(/^0x/i, '').replace(/\s+/g, '').length >= 2) {
    return hexToBytes(raw);
  }

  // Base64 (best-effort)
  try {
    const b = base64ToBytes(raw);
    if (b.length) return b;
  } catch (e) {
    // fallthrough
  }

  // Fallback: treat as UTF-8 bytes
  const enc = new TextEncoder();
  return Array.from(enc.encode(raw));
}

// Track collection state
let kaspaCollecting = false;
let kaspaCollectedBlocks = [];
let kaspaTargetCount = 0;

export async function autoFetchVRF() {
  log('foldedOutputPanel', '🤖 Auto-fetching VRF entropy...', true);
  try {
    // Try Full (QRNG + BTC + KAS)
    try {
      state.foldedOutput = await portal.generateFullRandomness();
      log('foldedOutputPanel', '✅ VRF Secured: QRNG + Bitcoin + Kaspa');
      return;
    } catch (e) {
      console.warn('Full VRF failed, trying partial...', e);
      log('foldedOutputPanel', '⚠️ Full VRF failed: ' + e.message);
    }

    // Fallback to Partial (BTC + KAS)
    state.foldedOutput = await portal.generatePartialRandomness();
    log('foldedOutputPanel', '⚠️ VRF Fallback: Bitcoin + Kaspa (No QRNG)');

  } catch (err) {
    state.foldedOutput = null;
    log('foldedOutputPanel', '❌ VRF FAILED: ' + err.message);
    alert("Critical Error: Unable to generate verifiable randomness. Gameplay disabled.");
    throw err;
  }
}

export async function fetchKaspaBlocks() {
  const count = parseInt($('kaspaBlockCount').value) || 6;

  if (kaspaCollecting) {
    log('kaspaBlocksPanel', 'Already collecting... click Stop first.');
    return;
  }

  kaspaCollecting = true;
  kaspaCollectedBlocks = [];
  kaspaTargetCount = count;
  state.kaspaBlocks = [];

  const bps = 10; // ~10 blocks per second on Kaspa
  const estimatedSeconds = Math.ceil(count / bps);

  const panel = $('kaspaBlocksPanel');
  panel.innerHTML = '';
  panel.style.maxHeight = '400px';
  panel.style.overflow = 'auto';

  appendBlockLine(panel, `🚀 Fetching ${count} blocks via Portal...`);
  appendBlockLine(panel, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  $('kaspaBlockCountLabel').textContent = `(0/${count})`;

  try {
    // Use portal singleton to fetch blocks
    const blocks = await portal.fetchBlocks('kaspa', count);

    for (const b of blocks) {
      const hash = b.hash;
      const shortHash = hash ? hash.slice(0, 12) + '...' + hash.slice(-8) : 'unknown';
      kaspaCollectedBlocks.push({
        hash,
        blueScore: b.blueScore || b.header?.blueScore,
        time: b.timestamp || b.header?.timestamp,
        source: 'kaspa'
      });
      appendBlockLine(panel, `BS:${b.blueScore || '?'} | ${shortHash}`);
    }
    finishKaspaCollection();
  } catch (err) {
    appendBlockLine(panel, `Error: ${err.message}`);
    stopKaspaCollection();
  }
}

function appendBlockLine(panel, text) {
  const line = document.createElement('div');
  line.textContent = text;
  line.style.fontFamily = 'monospace';
  line.style.fontSize = '0.85em';
  line.style.padding = '2px 0';
  panel.appendChild(line);
}

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds/60)}m ${seconds%60}s`;
  return `${Math.floor(seconds/3600)}h ${Math.floor((seconds%3600)/60)}m`;
}

function finishKaspaCollection() {
  kaspaCollecting = false;
  state.kaspaBlocks = kaspaCollectedBlocks.slice(0, kaspaTargetCount);

  const panel = $('kaspaBlocksPanel');
  appendBlockLine(panel, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  appendBlockLine(panel, `✅ DONE! Collected ${state.kaspaBlocks.length} blocks`);
  appendBlockLine(panel, `First: ${state.kaspaBlocks[0]?.hash?.slice(0, 20)}...`);
  appendBlockLine(panel, `Last: ${state.kaspaBlocks[state.kaspaBlocks.length - 1]?.hash?.slice(0, 20)}...`);

  $('kaspaBlockCountLabel').textContent = `(${state.kaspaBlocks.length})`;
  $('fetchKaspaBtn').disabled = false;
  $('stopKaspaBtn').disabled = true;
  $('exportKaspaBtn').disabled = false;
}

export function stopKaspaCollection() {
  if (kaspaCollecting) {
    kaspaCollecting = false;
    state.kaspaBlocks = kaspaCollectedBlocks;

    const panel = $('kaspaBlocksPanel');
    appendBlockLine(panel, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    appendBlockLine(panel, `⏹️ Stopped. Collected ${kaspaCollectedBlocks.length} blocks.`);

    $('kaspaBlockCountLabel').textContent = `(${kaspaCollectedBlocks.length})`;
    $('fetchKaspaBtn').disabled = false;
    $('stopKaspaBtn').disabled = true;
    $('exportKaspaBtn').disabled = kaspaCollectedBlocks.length === 0;
  }
}

export async function fetchBtcBlocks() {
  const count = parseInt($('btcBlockCount').value) || 6;
  log('btcBlocksPanel', 'Fetching Bitcoin blocks...', true);

  try {
    const blocks = await portal.getBitcoinBlocks(count);
    state.btcBlocks = blocks;
    $('btcBlockCountLabel').textContent = `(${blocks.length})`;

    const output = blocks.map((b, i) => ({
      index: i,
      hash: b.hash,
      height: b.height,
      time: b.time,
      source: b.source,
    }));

    log('btcBlocksPanel', JSON.stringify(output, null, 2), true);
    $('exportBtcBtn').disabled = false;

  } catch (err) {
    log('btcBlocksPanel', 'Error: ' + err.message);
  }
}

export async function fetchQrng() {
  const bytes = parseInt($('qrngBytes').value) || 32;
  const manual = $('qrngInput')?.value?.trim?.() || '';
  log('qrngPanel', manual ? 'Using manual QRNG input...' : 'Fetching QRNG data...', true);

  try {
    const data = manual ? parseManualQrng(manual) : await portal.getQRNG('nist', bytes);
    if (!Array.isArray(data)) throw new Error('QRNG data must be an array of bytes');
    state.qrngData = data;
    $('qrngDataLabel').textContent = `(${data.length} bytes)`;

    log('qrngPanel', JSON.stringify({
      bytes: data.length,
      provider: manual ? 'manual' : 'nist',
      data,
    }, null, 2), true);
    $('exportQrngBtn').disabled = false;

  } catch (err) {
    log('qrngPanel', 'Error: ' + err.message);
  }
}

export async function fetchAllSources() {
  await Promise.all([
    fetchKaspaBlocks(),
    fetchBtcBlocks(),
    fetchQrng(),
  ]);
}

export async function foldSources() {
  const includeKaspa = $('foldKaspa').checked;
  const includeBtc = $('foldBtc').checked;
  const includeQrng = $('foldQrng').checked;
  const iterations = parseInt($('foldIterations').value) || 2;

  log('foldedOutputPanel', 'Folding sources...', true);

  const sources = [];

  if (includeKaspa && state.kaspaBlocks.length > 0) {
    const kaspaHex = state.kaspaBlocks.map(b => b.hash).join('');
    sources.push({ name: 'kaspa', data: kaspaHex });
  }

  if (includeBtc && state.btcBlocks.length > 0) {
    const btcHex = state.btcBlocks.map(b => b.hash).join('');
    sources.push({ name: 'btc', data: btcHex });
  }

  if (includeQrng && state.qrngData.length > 0) {
    const qrngBits = state.qrngData.map(b => b.toString(2).padStart(8, '0')).join('');
    sources.push({ name: 'qrng', data: qrngBits });
  }

  if (sources.length === 0) {
    log('foldedOutputPanel', 'No sources selected or fetched!');
    return;
  }

  try {
    let result;
    if (sources.length === 1) {
      result = hexToBinary(sources[0].data.slice(0, 64).padEnd(64, '0'));
    } else if (sources.length === 2) {
      result = await portal.fold(sources[0].data, sources[1].data, { iterations });
    } else {
      const fold1 = await portal.fold(sources[0].data, sources[1].data, { iterations });
      result = await portal.fold(fold1, sources[2].data, { iterations });
    }

    state.foldedOutput = result;
    log('foldedOutputPanel', JSON.stringify({
      sources: sources.map(s => s.name),
      iterations,
      outputBits: result.length,
      output: result,
    }, null, 2), true);
    $('exportFoldedBtn').disabled = false;

  } catch (err) {
    log('foldedOutputPanel', 'Error: ' + err.message);
  }
}

export function initVrfSources() {
  if (!$('fetchKaspaBtn')) return; // Guard

  $('fetchKaspaBtn').addEventListener('click', () => {
    $('fetchKaspaBtn').disabled = true;
    $('stopKaspaBtn').disabled = false;
    fetchKaspaBlocks();
  });

  $('stopKaspaBtn').addEventListener('click', () => {
    stopKaspaCollection();
    $('fetchKaspaBtn').disabled = false;
    $('stopKaspaBtn').disabled = true;
  });

  $('fetchBtcBtn').addEventListener('click', fetchBtcBlocks);
  $('fetchQrngBtn').addEventListener('click', fetchQrng);
  $('foldBtn').addEventListener('click', foldSources);

  $('exportKaspaBtn').addEventListener('click', () => {
    downloadJSON({
      source: 'kaspa',
      blocks: state.kaspaBlocks.map(b => ({
        hash: b.hash,
        blueScore: b.blueScore || b.height,
        time: b.time,
      })),
    }, 'kaspa-blocks.json');
  });

  $('exportBtcBtn').addEventListener('click', () => {
    downloadJSON({
      source: 'bitcoin',
      blocks: state.btcBlocks.map(b => ({
        hash: b.hash,
        height: b.height,
        time: b.time,
      })),
    }, 'btc-blocks.json');
  });

  $('exportQrngBtn').addEventListener('click', () => {
    const manual = $('qrngInput')?.value?.trim?.() || '';
    downloadJSON({
      source: 'qrng',
      provider: manual ? 'manual' : 'nist',
      data: state.qrngData,
    }, 'qrng-data.json');
  });

  $('exportFoldedBtn').addEventListener('click', () => {
    downloadJSON({
      folded: state.foldedOutput,
      sources: {
        kaspa: state.kaspaBlocks.length,
        btc: state.btcBlocks.length,
        qrng: state.qrngData.length,
      },
    }, 'folded-output.json');
  });
}
