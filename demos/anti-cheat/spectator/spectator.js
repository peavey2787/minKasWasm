// spectator.js - Main controller for Spectator mode
// Uses the global kaspaPortal singleton exclusively

import { $ } from '../dom_elements.js';
import { state, portal, addIndexerUpdateHandler, removeIndexerUpdateHandler, resetSpectatorState, addFoundSession, getFoundSessionsSorted } from '../state.js';
import { setStatus, log, createGrid } from '../utils.js';
import { handleMatchObject, initialBackfillFromIndexer, findLatestSessionId, extractSessionFromTx, bootstrapGameBrowserFromCache } from './indexer_integration.js';
import { replayFromStart, cancelReplay } from './replay.js';
import { resetLiveQueue } from './processor.js';
import { resetForSession, ensureBehindBanner, setSpectatorBadges, applyMove, injectGameBrowser, updateGameList } from './ui.js';

const INDEXER_EVENT = Object.freeze({
  MATCHING_TRANSACTION_IN_MEMORY: 'matching-transaction-in-memory',
  MATCHING_TRANSACTION_CACHED: 'matching-transaction-cached',
});

let spectatorTimer = null;
let isScanning = false;

// Persistent handler for both Spectator Mode and Game Browser
// ALWAYS listens for new games, regardless of isScanning state
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

  // 2. Game Browser - ALWAYS detect new games (not just when isScanning)
  // This ensures the persistent game list stays up-to-date
  if (evt.type === INDEXER_EVENT.MATCHING_TRANSACTION_IN_MEMORY) {
    let updated = false;
    for (const tx of items) {
      const session = extractSessionFromTx(tx, prefix);
      if (session) {
        const isNew = addFoundSession(session);
        if (isNew) updated = true;
      }
    }
    // Only refresh UI if scanning is active (to avoid jarring updates)
    if (updated && isScanning) {
      updateGameList(getFoundSessionsSorted());
    }
  }
};

export async function startSpectator(targetSessionId = null) {
  if (!state.connected) {
    alert('Connect to a node first!');
    return;
  }

  if (!portal.isReady) {
    alert('Portal not ready yet. Connect first.');
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
  portal.setScannerPrefix(prefix);

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
    // Stop scanning - but don't clear the list!
    isScanning = false;
    if (btn) {
      btn.textContent = 'Start Scan';
      btn.classList.remove('danger');
    }
  } else {
    // Start scanning
    isScanning = true;
    if (btn) {
      btn.textContent = 'Stop Scan';
      btn.classList.add('danger');
    }

    // Bootstrap from cached/in-memory transactions first
    // This bridges the "Live vs. Historical" gap
    (async () => {
      const prefix = $('payloadPrefix')?.value || 'KKTP';
      await bootstrapGameBrowserFromCache(prefix);
      updateGameList(getFoundSessionsSorted());
    })();
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

  // Security log toggle
  const toggleBtn = document.getElementById('toggleSecurityLogBtn');
  const secContainer = document.getElementById('securityLogContainer');
  if (toggleBtn && secContainer) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = secContainer.classList.contains('hidden');
      secContainer.classList.toggle('hidden', !isHidden);
      toggleBtn.textContent = isHidden ? 'Hide Security Details' : 'Show Security Details';
    });
  }

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
