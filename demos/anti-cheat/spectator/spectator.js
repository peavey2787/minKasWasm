// spectator.js - Main controller for Spectator mode

import { $ } from '../dom_elements.js';
import { state, addIndexerUpdateHandler, removeIndexerUpdateHandler, resetSpectatorState } from '../state.js';
import { setStatus, log, createGrid } from '../utils.js';
import { handleMatchObject, initialBackfillFromIndexer, findLatestSessionId } from './indexer_integration.js';
import { replayFromStart, cancelReplay } from './replay.js';
import { resetLiveQueue } from './processor.js';
import { resetForSession, ensureBehindBanner, setSpectatorBadges, applyMove } from './ui.js';

const INDEXER_EVENT = Object.freeze({
  MATCHING_TRANSACTION_IN_MEMORY: 'matching-transaction-in-memory',
  MATCHING_TRANSACTION_CACHED: 'matching-transaction-cached',
});

let indexerHandler = null;
let spectatorTimer = null;

export async function startSpectator() {
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

  let startSession = state.sessionId || null;
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

  indexerHandler = async (evt) => {
    if (!state.spectatorActive) return;
    if (!evt || !evt.type) return;

    const items = Array.isArray(evt.data) ? evt.data : (evt.data ? [evt.data] : []);

    if (evt.type === INDEXER_EVENT.MATCHING_TRANSACTION_IN_MEMORY || 
        evt.type === INDEXER_EVENT.MATCHING_TRANSACTION_CACHED) {
      for (const item of items) {
        await handleMatchObject(item, prefix);
      }
    }
  };
  addIndexerUpdateHandler(indexerHandler);

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

  if (indexerHandler) {
    removeIndexerUpdateHandler(indexerHandler);
    indexerHandler = null;
  }

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

export function initSpectator() {
  if (!$('startSpectatorBtn')) return;

  createGrid('spectatorGrid', 'grid-cell spectator-mode');
  $('startSpectatorBtn').addEventListener('click', startSpectator);
  $('replaySpectatorBtn').addEventListener('click', replayFromStart);
  $('stopSpectatorBtn').addEventListener('click', stopSpectator);

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