// anti-cheat.js - Main demo controller
// VRF Demo with QRNG + BTC + KAS, Merkle anchoring, and spectator mode

import { connect } from '../../wrapper/kaspa_client.js';
import { KaspaBlockScanner, SearchMode } from '../../wrapper/scanner.js';
import { init as walletInit, createWallet, send } from '../../wrapper/wallet_service.js';
import { stringToHex, hexToString } from '../../wrapper/utilities.js';

// VRF Core imports
import { getBitcoinBlocks } from '../../vrf/core/fetcher/bitcoin.js';
import { getQRNG } from '../../vrf/core/fetcher/qrng.js';
import { getIndexedKaspaBlocks, collectKaspaBlocksFromScanner } from '../../vrf/core/fetcher/scanner-adapter.js';
import { hexToBinary } from '../../vrf/core/crypto.js';
import { runNistSuite } from '../../vrf/core/nist.js';
import core from '../../vrf/core/index.js';

// Merkle tree utilities
import { MerkleTree, sha256Hex } from './merkle.js';

// ============================================================================
// State
// ============================================================================

const state = {
  connected: false,
  client: null,
  scanner: null,
  walletAddress: null,
  walletReady: false,

  // VRF data
  kaspaBlocks: [],
  btcBlocks: [],
  qrngData: [],
  foldedOutput: null,
  nistResults: [],

  // Player state
  playerActive: false,
  playerPos: { x: 4, y: 4 },
  moveLog: [],
  merkleTree: null,
  anchorInterval: 250,
  anchorTimer: null,

  // Spectator state
  spectatorActive: false,
  spectatorPos: { x: 4, y: 4 },
  spectatorMoves: [],
};

// ============================================================================
// DOM Helpers
// ============================================================================

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function setStatus(elementId, text, type = 'pending') {
  const el = $(elementId);
  if (el) {
    el.textContent = text;
    el.className = `status-badge ${type}`;
  }
}

function log(panelId, msg, clear = false) {
  const panel = $(panelId);
  if (!panel) return;
  if (clear) panel.textContent = '';
  panel.textContent += msg + '\n';
  panel.scrollTop = panel.scrollHeight;
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================================
// Tab Navigation
// ============================================================================

function initTabs() {
  const tabBtns = $$('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      const tabId = 'tab-' + btn.dataset.tab;
      $(tabId)?.classList.add('active');
    });
  });
}

// ============================================================================
// Collapsible Sections
// ============================================================================

function initCollapsibles() {
  $$('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const targetId = header.dataset.target;
      const content = $(targetId);
      if (content) {
        content.classList.toggle('open');
        const arrow = header.querySelector('span:last-child');
        if (arrow) arrow.textContent = content.classList.contains('open') ? '▲' : '▼';
      }
    });
  });
}

// ============================================================================
// Connection
// ============================================================================

async function handleConnect() {
  const networkId = $('networkSelect').value;
  const useResolver = $('usePublicResolver').checked;
  const nodeUrl = $('nodeUrl').value.trim();

  setStatus('connectionStatus', 'Connecting...', 'pending');

  try {
    state.client = useResolver
      ? await connect(null, networkId)
      : await connect(nodeUrl, networkId);

    // Initialize scanner for block indexing
    state.scanner = new KaspaBlockScanner(state.client, {
      indexerOptions: {
        matchMode: 'blocks',
        inMemoryMaxBlocks: 100,
        ttlMinutes: 60,
      }
    });
    await state.scanner.indexer.initDB();

    // Start scanning for blocks
    state.scanner.start((block, matches) => {
      // Blocks are automatically indexed
    });
    state.scanner.indexer.start();

    // Initialize wallet service
    await walletInit({
      rpcClient: state.client,
      networkId,
      logger: (...args) => console.log('[Wallet]', ...args),
    });

    try {
      const { address } = await createWallet({ password: 'anticheat-demo' });
      state.walletAddress = address;
      state.walletReady = true;
      console.log('Wallet ready:', address);
    } catch (e) {
      console.warn('Wallet creation failed:', e.message);
    }

    state.connected = true;
    setStatus('connectionStatus', 'Connected', 'connected');

  } catch (err) {
    console.error('Connection failed:', err);
    setStatus('connectionStatus', 'Failed: ' + err.message, 'disconnected');
  }
}

function initConnection() {
  $('usePublicResolver').addEventListener('change', (e) => {
    $('nodeUrl').disabled = e.target.checked;
  });
  $('connectBtn').addEventListener('click', handleConnect);
}

// ============================================================================
// VRF Sources
// ============================================================================

async function fetchKaspaBlocks() {
  const count = parseInt($('kaspaBlockCount').value) || 6;
  log('kaspaBlocksPanel', 'Fetching Kaspa blocks from scanner...', true);

  try {
    // Try to get from scanner first
    let blocks = getIndexedKaspaBlocks(state.scanner, count);
    
    if (blocks.length < count && state.scanner) {
      log('kaspaBlocksPanel', `Got ${blocks.length} from cache, waiting for more...`);
      blocks = await collectKaspaBlocksFromScanner(state.scanner, count, 15000);
    }

    if (blocks.length === 0) {
      // Fallback to API
      log('kaspaBlocksPanel', 'No blocks from scanner, falling back to API...');
      const { getKaspaBlocks } = await import('../../vrf/core/fetcher/kaspa.js');
      blocks = await getKaspaBlocks(count);
    }

    state.kaspaBlocks = blocks;
    $('kaspaBlockCountLabel').textContent = `(${blocks.length})`;

    const output = blocks.map((b, i) => ({
      index: i,
      hash: b.hash,
      blueScore: b.blueScore || b.height,
      time: b.time,
      source: b.source,
    }));

    log('kaspaBlocksPanel', JSON.stringify(output, null, 2), true);
    $('exportKaspaBtn').disabled = false;

  } catch (err) {
    log('kaspaBlocksPanel', 'Error: ' + err.message);
  }
}

async function fetchBtcBlocks() {
  const count = parseInt($('btcBlockCount').value) || 6;
  log('btcBlocksPanel', 'Fetching Bitcoin blocks...', true);

  try {
    const blocks = await getBitcoinBlocks(count);
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

async function fetchQrng() {
  const bytes = parseInt($('qrngBytes').value) || 32;
  log('qrngPanel', 'Fetching QRNG data...', true);

  try {
    const data = await getQRNG('anu', bytes);
    state.qrngData = data;
    $('qrngDataLabel').textContent = `(${data.length} bytes)`;

    log('qrngPanel', JSON.stringify({ bytes: data.length, data }, null, 2), true);
    $('exportQrngBtn').disabled = false;

  } catch (err) {
    log('qrngPanel', 'Error: ' + err.message);
  }
}

async function fetchAllSources() {
  await Promise.all([
    fetchKaspaBlocks(),
    fetchBtcBlocks(),
    fetchQrng(),
  ]);
}

async function foldSources() {
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
      // Single source - just hash it
      result = hexToBinary(sources[0].data.slice(0, 64).padEnd(64, '0'));
    } else if (sources.length === 2) {
      result = await core.fold(sources[0].data, sources[1].data, { iterations });
    } else {
      // Fold first two, then fold result with third
      const fold1 = await core.fold(sources[0].data, sources[1].data, { iterations });
      result = await core.fold(fold1, sources[2].data, { iterations });
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

function initVrfSources() {
  $('fetchKaspaBtn').addEventListener('click', fetchKaspaBlocks);
  $('fetchBtcBtn').addEventListener('click', fetchBtcBlocks);
  $('fetchQrngBtn').addEventListener('click', fetchQrng);
  $('fetchAllBtn').addEventListener('click', fetchAllSources);
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
    downloadJSON({
      source: 'qrng',
      provider: 'anu',
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

// ============================================================================
// NIST Tests
// ============================================================================

async function runNistTests() {
  const source = $('nistSource').value;
  let bits = '';

  switch (source) {
    case 'kaspa':
      if (state.kaspaBlocks.length === 0) {
        alert('Fetch Kaspa blocks first!');
        return;
      }
      bits = state.kaspaBlocks.map(b => hexToBinary(b.hash)).join('');
      break;
    case 'btc':
      if (state.btcBlocks.length === 0) {
        alert('Fetch Bitcoin blocks first!');
        return;
      }
      bits = state.btcBlocks.map(b => hexToBinary(b.hash)).join('');
      break;
    case 'qrng':
      if (state.qrngData.length === 0) {
        alert('Fetch QRNG data first!');
        return;
      }
      bits = state.qrngData.map(b => b.toString(2).padStart(8, '0')).join('');
      break;
    case 'folded':
      if (!state.foldedOutput) {
        alert('Fold sources first!');
        return;
      }
      bits = state.foldedOutput;
      break;
  }

  if (bits.length < 100) {
    alert('Need at least 100 bits for NIST tests. Current: ' + bits.length);
    return;
  }

  const progressBar = $('nistProgress');
  const progressFill = progressBar.querySelector('.progress-bar-fill');
  progressBar.style.display = 'block';
  progressFill.style.width = '0%';

  const tbody = $('nistResultsBody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Running tests...</td></tr>';

  try {
    const results = await runNistSuite(bits, (partial) => {
      const pct = Math.round((partial.length / 18) * 100);
      progressFill.style.width = pct + '%';
    });

    state.nistResults = results;
    tbody.innerHTML = '';

    for (const r of results) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.testName || 'Unknown'}</td>
        <td>${r.statistic !== null ? r.statistic.toFixed(6) : 'N/A'}</td>
        <td>${r.pValue !== null ? r.pValue.toFixed(6) : 'N/A'}</td>
        <td class="${r.passed ? 'nist-pass' : 'nist-fail'}">${r.passed ? 'PASS' : 'FAIL'}</td>
      `;
      tbody.appendChild(tr);
    }

    progressFill.style.width = '100%';
    setTimeout(() => progressBar.style.display = 'none', 1000);
    $('exportNistBtn').disabled = false;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger);">Error: ${err.message}</td></tr>`;
    progressBar.style.display = 'none';
  }
}

function initNistTests() {
  $('runNistBtn').addEventListener('click', runNistTests);
  $('exportNistBtn').addEventListener('click', () => {
    downloadJSON({
      source: $('nistSource').value,
      results: state.nistResults,
      timestamp: new Date().toISOString(),
    }, 'nist-results.json');
  });
}

// ============================================================================
// Player Section
// ============================================================================

function createGrid(containerId, cellClass, size = 10) {
  const container = $(containerId);
  container.innerHTML = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = document.createElement('div');
      cell.className = cellClass;
      cell.dataset.x = x;
      cell.dataset.y = y;
      container.appendChild(cell);
    }
  }
}

function updatePlayerGrid() {
  const cells = $$('#playerGrid .grid-cell');
  cells.forEach(cell => {
    cell.classList.remove('player', 'trail');
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    if (x === state.playerPos.x && y === state.playerPos.y) {
      cell.classList.add('player');
    }
  });
}

function recordMove(direction) {
  const move = {
    direction,
    x: state.playerPos.x,
    y: state.playerPos.y,
    timestamp: Date.now(),
  };
  state.moveLog.push(move);

  // Add to Merkle tree
  const moveHash = sha256Hex(JSON.stringify(move));
  if (!state.merkleTree) {
    state.merkleTree = new MerkleTree();
  }
  state.merkleTree.addLeaf(moveHash);

  log('moveLogPanel', `[${direction}] → (${move.x}, ${move.y})`);
  log('merkleTreePanel', `Root: ${state.merkleTree.getRoot() || 'computing...'}`);
}

function handlePlayerKeydown(e) {
  if (!state.playerActive) return;

  let dir = null;
  switch (e.key.toLowerCase()) {
    case 'arrowup':
    case 'w':
      if (state.playerPos.y > 0) {
        state.playerPos.y--;
        dir = 'UP';
      }
      break;
    case 'arrowdown':
    case 's':
      if (state.playerPos.y < 9) {
        state.playerPos.y++;
        dir = 'DOWN';
      }
      break;
    case 'arrowleft':
    case 'a':
      if (state.playerPos.x > 0) {
        state.playerPos.x--;
        dir = 'LEFT';
      }
      break;
    case 'arrowright':
    case 'd':
      if (state.playerPos.x < 9) {
        state.playerPos.x++;
        dir = 'RIGHT';
      }
      break;
  }

  if (dir) {
    e.preventDefault();
    recordMove(dir);
    updatePlayerGrid();
  }
}

async function anchorToKaspa() {
  if (!state.walletReady || !state.merkleTree) return;

  const root = state.merkleTree.getRoot();
  if (!root) return;

  const prefix = $('payloadPrefix').value || 'anticheat:move';
  const payload = `${prefix}:${root}:${Date.now()}`;

  try {
    log('anchorTxPanel', `Anchoring: ${payload.slice(0, 50)}...`);
    await send({
      amount: '0.0001',
      toAddress: state.walletAddress,
      payload,
    });
    log('anchorTxPanel', `✓ Anchored root: ${root.slice(0, 16)}...`);
  } catch (err) {
    log('anchorTxPanel', `✗ Anchor failed: ${err.message}`);
  }
}

function startPlayer() {
  if (!state.connected) {
    alert('Connect to a node first!');
    return;
  }

  state.playerActive = true;
  state.playerPos = { x: 4, y: 4 };
  state.moveLog = [];
  state.merkleTree = new MerkleTree();
  state.anchorInterval = parseInt($('anchorInterval').value) || 250;

  createGrid('playerGrid', 'grid-cell');
  updatePlayerGrid();
  log('moveLogPanel', 'Game started! Use arrow keys or WASD.', true);
  log('merkleTreePanel', 'Merkle tree initialized.', true);
  log('anchorTxPanel', `Anchoring every ${state.anchorInterval}ms`, true);

  document.addEventListener('keydown', handlePlayerKeydown);

  // Start anchor timer
  if (state.walletReady) {
    state.anchorTimer = setInterval(anchorToKaspa, state.anchorInterval);
  }

  setStatus('playerStatus', 'Playing', 'connected');
  $('startPlayerBtn').disabled = true;
  $('stopPlayerBtn').disabled = false;
}

function stopPlayer() {
  state.playerActive = false;
  document.removeEventListener('keydown', handlePlayerKeydown);

  if (state.anchorTimer) {
    clearInterval(state.anchorTimer);
    state.anchorTimer = null;
  }

  setStatus('playerStatus', 'Stopped', 'disconnected');
  $('startPlayerBtn').disabled = false;
  $('stopPlayerBtn').disabled = true;
}

function initPlayer() {
  createGrid('playerGrid', 'grid-cell');
  $('startPlayerBtn').addEventListener('click', startPlayer);
  $('stopPlayerBtn').addEventListener('click', stopPlayer);
}

// ============================================================================
// Spectator Section
// ============================================================================

function updateSpectatorGrid() {
  const cells = $$('#spectatorGrid .spectator-cell');
  cells.forEach(cell => {
    cell.classList.remove('player');
    const x = parseInt(cell.dataset.x);
    const y = parseInt(cell.dataset.y);
    if (x === state.spectatorPos.x && y === state.spectatorPos.y) {
      cell.classList.add('player');
    }
  });
}

function parseMove(payload) {
  // Expected format: prefix:merkleRoot:timestamp or prefix:direction:x:y:timestamp
  try {
    const parts = payload.split(':');
    if (parts.length >= 2) {
      return {
        prefix: parts[0],
        data: parts.slice(1).join(':'),
        raw: payload,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function startSpectator() {
  if (!state.connected || !state.scanner) {
    alert('Connect to a node first!');
    return;
  }

  const prefix = $('spectatorPrefix').value || 'anticheat:move';
  state.spectatorActive = true;
  state.spectatorPos = { x: 4, y: 4 };
  state.spectatorMoves = [];

  createGrid('spectatorGrid', 'spectator-cell');
  updateSpectatorGrid();
  log('spectatorMovePanel', `Watching for prefix: ${prefix}`, true);
  log('spectatorVerifyPanel', 'Waiting for moves...', true);

  // Set scanner to watch for our prefix
  state.scanner.prefix = prefix;
  state.scanner.searchMode = SearchMode.STARTS_WITH;

  // Override onBlock to capture matches
  const originalOnBlock = state.scanner.onBlock;
  state.scanner.onBlock = (block, matches) => {
    if (originalOnBlock) originalOnBlock(block, matches);

    for (const match of matches) {
      if (match.decodedPayload) {
        const parsed = parseMove(match.decodedPayload);
        if (parsed) {
          state.spectatorMoves.push({
            ...parsed,
            txid: match.txid,
            timestamp: match.timestamp,
          });
          log('spectatorMovePanel', `[${new Date(match.timestamp).toLocaleTimeString()}] ${parsed.data.slice(0, 40)}...`);
          log('spectatorVerifyPanel', `TX: ${match.txid.slice(0, 16)}...`);
        }
      }
    }
  };

  setStatus('spectatorStatus', 'Watching', 'connected');
  $('startSpectatorBtn').disabled = true;
  $('stopSpectatorBtn').disabled = false;
}

function stopSpectator() {
  state.spectatorActive = false;
  if (state.scanner) {
    state.scanner.prefix = null;
  }

  setStatus('spectatorStatus', 'Stopped', 'disconnected');
  $('startSpectatorBtn').disabled = false;
  $('stopSpectatorBtn').disabled = true;
}

function initSpectator() {
  createGrid('spectatorGrid', 'spectator-cell');
  $('startSpectatorBtn').addEventListener('click', startSpectator);
  $('stopSpectatorBtn').addEventListener('click', stopSpectator);
}

// ============================================================================
// Initialize
// ============================================================================

function init() {
  initTabs();
  initCollapsibles();
  initConnection();
  initVrfSources();
  initNistTests();
  initPlayer();
  initSpectator();
}

document.addEventListener('DOMContentLoaded', init);
