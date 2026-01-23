import { state } from '../state.js';
import { recordMove } from './logic.js';
import { updatePlayerGrid } from './ui.js';

export async function handlePlayerKeydown(e) {
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
    await recordMove(dir);
    updatePlayerGrid();
  }
}