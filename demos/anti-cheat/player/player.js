// player.js - Main controller for Player mode
// Uses the global kaspaPortal singleton exclusively

import { $ } from '../dom_elements.js';
import { state, portal, resetPlayerState } from '../state.js';
import { setStatus, log, createGrid } from '../utils.js';
import * as KKTP from '../kktp_lib.js';
import { setPlayerSessionBadge, updatePlayerGrid } from './ui.js';
import { newSessionId } from './logic.js';
import { handlePlayerKeydown } from './input.js';
import { performKKTPHandshake, publishGameLoop } from './network.js';

export async function startPlayer() {
  if (!state.connected) {
    alert('Connect to a node first!');
    return;
  }

  resetPlayerState();

  state.sessionId = newSessionId();
  state.playerStartPos = { x: 4, y: 4 };
  state.playerPos = { ...state.playerStartPos };
  state.kktp.seq = 0;

  setPlayerSessionBadge();

  state.playerActive = true;
  state.anchorInterval = parseInt($('anchorInterval').value) || 1250;

  createGrid('playerGrid', 'grid-cell');
  updatePlayerGrid();
  log('moveLogPanel', `Game started! Session: ${state.sessionId.slice(0, 8)}`, true);
  log('merkleTreePanel', 'Merkle tree initialized.', true);
  log('anchorTxPanel', `Syncing every ${state.anchorInterval}ms`, true);

  document.addEventListener('keydown', handlePlayerKeydown);

  window.dispatchEvent(new CustomEvent('antiCheat:newSession', {
    detail: { sessionId: state.sessionId, startPos: state.playerStartPos }
  }));

  if (state.walletReady) {
    await performKKTPHandshake();
    state.anchorTimer = setInterval(publishGameLoop, state.anchorInterval);
  } else {
    log('anchorTxPanel', 'Wallet not ready. Connect again.', true);
  }

  setStatus('playerStatus', 'Playing', 'connected');
  $('startPlayerBtn').disabled = true;
  $('stopPlayerBtn').disabled = false;
}

export async function stopPlayer() {
  state.playerActive = false;
  document.removeEventListener('keydown', handlePlayerKeydown);

  if (state.anchorTimer) {
    clearInterval(state.anchorTimer);
    state.anchorTimer = null;
  }

  if (state.walletReady && state.kktp.identity) {
    const endAnchor = await KKTP.createSessionEndAnchor(state.sessionId, state.kktp.identity);
    const prefix = $('payloadPrefix')?.value || 'KKTP';
    await portal.send({
      amount: '0.2',
      toAddress: state.walletAddress,
      payload: KKTP.buildKKTPPayload(prefix + ':', endAnchor)
    });
    log('anchorTxPanel', 'Session Closed.');
  }

  setStatus('playerStatus', 'Stopped', 'disconnected');
  $('startPlayerBtn').disabled = false;
  $('stopPlayerBtn').disabled = true;
}

export function initPlayer() {
  if (!$('startPlayerBtn')) return;

  createGrid('playerGrid', 'grid-cell');
  $('startPlayerBtn').addEventListener('click', startPlayer);
  $('stopPlayerBtn').addEventListener('click', stopPlayer);
}
