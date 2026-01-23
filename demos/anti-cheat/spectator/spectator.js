// spectator.js - Main controller for Spectator mode

import { $ } from '../dom_elements.js';
import { state, addIndexerUpdateHandler, removeIndexerUpdateHandler, resetSpectatorState } from '../state.js';
import { setStatus, log, createGrid } from '../utils.js';
import { handleMatchObject, initialBackfillFromIndexer, findLatestSessionId, extractSessionFromTx } from './indexer_integration.js';
import { replayFromStart, cancelReplay } from './replay.js';
import { resetLiveQueue } from './processor.js';
import { resetForSession, ensureBehindBanner, setSpectatorBadges, applyMove, injectGameBrowser, updateGameList } from './ui.js';

const INDEXER_EVENT = Object.freeze({
  MATCHING_TRANSACTION_IN_MEMORY: 'matching-transaction-in-memory',
  MATCHING_TRANSACTION_CACHED: 'matching-transaction-cached',
});

let spectatorTimer = null;
let isScanning = false;
let foundSessions = new Map();

// Persistent handler for both Spectator Mode and Game Browser
const indexerHandler = async (evt) => {
  if (!evt || !evt.type) return;
  const items = Array.isArray(evt.data) ? evt.data : (evt.data ? [evt.data] : []);
  const prefix = $('payloadPrefix')?.value || 'KKTP';

  // 1. Spectator Active Logic
  if (state.spectatorActive) {
    if (evt.type === INDEXER_EVENT.MATCHING_TRANSACTION_IN_MEMORY || 
        evt.type === INDEXER_EVENT.MATCHING_TRANSACTION_CACHED) {
      for (const item of items) {
        await handleMatchObject(item, prefix);
      }
    }
  }

  // 2. Game Browser Scanning Logic (Live Only)
  if (isScanning && evt.type === INDEXER_EVENT.MATCHING_TRANSACTION_IN_MEMORY) {
    let updated = false;
    for (const tx of items) {
      const session = extractSessionFromTx(tx, prefix);
      if (session && !foundSessions.has(session.sid)) {
        foundSessions.set(session.sid, session);
        updated = true;
      }
    }
    if (updated) {
      const sorted = Array.from(foundSessions.values()).sort((a, b) => b.timestamp - a.timestamp);
      updateGameList(sorted);
    }
  }
};

export async function startSpectator(targetSessionId = null) {
  if (!state.connected) {
    alert('Connect to a node first!');
    return;
  }

  if (!state.portal.intelligence.scanner) {
    alert('Scanner not ready yet. Connect first.');
    return;
  }

  stopSpectator();
  cancelReplay();
  resetSpectatorState();

  let startSession = targetSessionId || state.sessionId || null;
  const startPos = state.playerStartPos || { x: 4, y: 4 };
  const prefix = $('payloadPrefix')?.value || 'KKTP';

  if (!startSession) {
    log('spectatorLogPanel', 'Searching for latest session...', false);
    startSession = await findLatestSessionId(prefix);
  }

  resetForSession(startSession, startPos);

  state.spectatorActive = true;
  state.portal.intelligence.scanner.prefix = prefix;

  log('spectatorLogPanel', `Watching for anchors... prefix="${prefix}"`, false);

  (async () => {
    await initialBackfillFromIndexer(prefix);
  })();

  setStatus('spectatorStatus', 'Watching', 'connected');
  $('startSpectatorBtn').disabled = true;
  $('replaySpectatorBtn').disabled = true;
  $('stopSpectatorBtn').disabled = false;
}

export function stopSpectator() {
  state.spectatorActive = false;

  cancelReplay();

  if (spectatorTimer) {
    clearInterval(spectatorTimer);
    spectatorTimer = null;
  }

  resetLiveQueue();

  setStatus('spectatorStatus', 'Stopped', 'disconnected');
  $('startSpectatorBtn').disabled = false;
  if ($('replaySpectatorBtn')) $('replaySpectatorBtn').disabled = false;
  $('stopSpectatorBtn').disabled = true;
}

export function syncWithPlayer(move) {
  if (!state.spectatorActive) return;
  applyMove(move.direction);
  log('spectatorLogPanel', `[LIVE] ${move.direction} → (${move.x}, ${move.y})`);
}

function toggleGameScanning() {
  const btn = document.getElementById('refreshGamesBtn');
  
  if (isScanning) {
    // Stop scanning
    isScanning = false;
    if (btn) {
      btn.textContent = 'Start Scan';
      btn.classList.remove('danger');
    }
  } else {
    // Start scanning
    isScanning = true;
    foundSessions.clear();
    updateGameList([]); // Clear UI
    if (btn) {
      btn.textContent = 'Stop Scan';
      btn.classList.add('danger');
    }
  }
}

export function initSpectator() {
  if (!$('startSpectatorBtn')) return;

  createGrid('spectatorGrid', 'grid-cell spectator-mode');
  $('startSpectatorBtn').addEventListener('click', startSpectator);
  $('replaySpectatorBtn').addEventListener('click', replayFromStart);
  $('stopSpectatorBtn').addEventListener('click', stopSpectator);

  // Register the persistent handler
  addIndexerUpdateHandler(indexerHandler);

  // Inject the game browser UI
  injectGameBrowser(toggleGameScanning, (sid) => {
    startSpectator(sid);
  });

  try {
    ensureBehindBanner();
  } catch { /* ignore */ }

  window.addEventListener('antiCheat:newSession', (ev) => {
    const { sessionId, startPos } = ev.detail || {};
    if (!sessionId) return;

    cancelReplay();

    if (state.spectatorActive) {
      resetForSession(sessionId, startPos);
      log('spectatorLogPanel', `New game detected! Resetting to session ${sessionId.slice(0, 8)}...`, false);
    } else {
      state.spectatorSessionId = sessionId;
      setSpectatorBadges();
    }
  });

  window.addEventListener('antiCheat:move', (ev) => {
    if (ev.detail) syncWithPlayer(ev.detail);
  });
}