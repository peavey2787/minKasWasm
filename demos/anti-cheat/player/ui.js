import { $, $$ } from '../dom_elements.js';
import { state } from '../state.js';

export function setPlayerSessionBadge() {
  const el = $('playerSessionBadge');
  if (el) el.textContent = `session: ${state.sessionId ? state.sessionId.slice(0, 8) : '--'}`;
}

export function updatePlayerGrid() {
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