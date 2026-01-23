import { $, $$ } from '../dom_elements.js';
import { state } from '../state.js';
import { log, createGrid } from '../utils.js';

export function ensureBehindBanner() {
  let el = document.getElementById('spectatorBehindBanner');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'spectatorBehindBanner';
  el.className = 'spectator-behind-banner';
  el.textContent = 'Spectator behind…';
  document.body.appendChild(el);
  return el;
}

export function setBehindBanner(on, msg) {
  const el = ensureBehindBanner();
  if (msg) el.textContent = msg;
  el.classList.toggle('on', !!on);
}

export function setSpectatorBadges() {
  const sEl = $('spectatorSessionBadge');
  const lEl = $('spectatorLatencyBadge');

  if (sEl) {
    sEl.textContent = `session: ${state.spectatorSessionId ? state.spectatorSessionId.slice(0, 8) : '--'}`;
  }

  const lat = state.spectatorLatency;
  if (lEl) {
    if (!lat || !lat.count) {
      lEl.textContent = 'latency: --';
    } else {
      lEl.textContent = `latency: ${Math.round(lat.last)}ms | avg ${Math.round(lat.avg)}ms | max ${Math.round(lat.max)}ms`;
    }
  }
}

export function updateSpectatorGrid() {
  const cells = $$('#spectatorGrid .grid-cell');
  cells.forEach(cell => {
    cell.classList.remove('spectator', 'trail');
    const x = parseInt(cell.dataset.x, 10);
    const y = parseInt(cell.dataset.y, 10);
    if (x === state.spectatorPos.x && y === state.spectatorPos.y) {
      cell.classList.add('spectator');
    }
  });
}

export function applyMove(direction) {
  switch (direction) {
    case 'UP':
      if (state.spectatorPos.y > 0) state.spectatorPos.y--;
      break;
    case 'DOWN':
      if (state.spectatorPos.y < 9) state.spectatorPos.y++;
      break;
    case 'LEFT':
      if (state.spectatorPos.x > 0) state.spectatorPos.x--;
      break;
    case 'RIGHT':
      if (state.spectatorPos.x < 9) state.spectatorPos.x++;
      break;
  }
  updateSpectatorGrid();
}

export function resetForSession(sessionId, startPos) {
  state.spectatorSessionId = sessionId ?? null;
  state.spectatorExpectedPrevRoot = 'GENESIS';
  state.spectatorExpectedRound = 0;
  state.spectatorLastSeq = -1;
  state.spectatorPendingByPrevRoot = new Map();
  state.spectatorBuffer = new Map();
  state.spectatorSeenKeys = new Set();
  state.seenMerkleRoots = new Set();
  state.spectatorLastRoot = null;
  state.spectatorLastRound = null;

  state.spectatorPos = {
    x: startPos?.x ?? 4,
    y: startPos?.y ?? 4
  };

  state.spectatorLatency = { last: null, avg: null, max: null, count: 0, sum: 0 };

  setSpectatorBadges();
  createGrid('spectatorGrid', 'grid-cell spectator-mode');
  updateSpectatorGrid();

  log('spectatorLogPanel', `Spectator reset. Session: ${state.spectatorSessionId ? state.spectatorSessionId.slice(0, 8) : '--'}`, true);
}