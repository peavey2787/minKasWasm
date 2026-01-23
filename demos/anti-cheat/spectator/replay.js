import { state } from '../state.js';
import { setStatus, log } from '../utils.js';
import { $ } from '../dom_elements.js';
import { collectSessionAnchors } from './indexer_integration.js';
import { resetForSession, applyMove, updateSpectatorGrid, setSpectatorBadges } from './ui.js';
import { replayState } from './spectator_state.js';

export function cancelReplay() {
  for (const t of replayState.timers) clearTimeout(t);
  replayState.timers = [];
  replayState.inProgress = false;
}

async function buildOrderedChain(anchors) {
  return anchors.filter(a => typeof a.seq0 === 'number').sort((a, b) => a.seq0 - b.seq0);
}

function applyMovesAnimated(anchors, stepMs = 75) {
  let delay = 0;
  for (const a of anchors) {
    const moves = a.moves || '';
    for (let i = 0; i < moves.length; i++) {
      const ch = moves[i];
      const dir = ch === 'U' ? 'UP' : ch === 'D' ? 'DOWN' : ch === 'L' ? 'LEFT' : ch === 'R' ? 'RIGHT' : null;
      if (!dir) continue;

      const tid = setTimeout(() => {
        if (!replayState.inProgress) return;
        applyMove(dir);
      }, delay);
      replayState.timers.push(tid);
      delay += stepMs;
    }
  }

  const doneId = setTimeout(() => {
    if (!replayState.inProgress) return;
    replayState.inProgress = false;
    setStatus('spectatorStatus', 'Replay Finished', 'connected');
    $('startSpectatorBtn').disabled = false;
    $('replaySpectatorBtn').disabled = false;
    $('stopSpectatorBtn').disabled = true;
    log('spectatorLogPanel', 'Replay finished.', false);
  }, delay + 10);
  replayState.timers.push(doneId);
}

export async function replayFromStart() {
  if (!state.connected) {
    alert('Connect to a node first!');
    return;
  }
  if (!state.portal.intelligence.scanner) {
    alert('Scanner not ready yet. Connect first.');
    return;
  }

  // Stop live watching if active
  // Note: We don't call stopSpectator() here to avoid full reset, just cancel replay timers
  cancelReplay();

  const prefix = $('payloadPrefix')?.value || 'KKTP';
  const sessionId = state.sessionId || state.spectatorSessionId;
  if (!sessionId) {
    alert('No session to replay yet. Start a game first.');
    return;
  }

  // Reset UI for replay
  resetForSession(sessionId, state.playerStartPos || { x: 4, y: 4 });

  replayState.inProgress = true;
  $('startSpectatorBtn').disabled = true;
  $('replaySpectatorBtn').disabled = true;
  $('stopSpectatorBtn').disabled = false;
  setStatus('spectatorStatus', 'Replaying', 'connected');
  log('spectatorLogPanel', `Replaying session ${sessionId.slice(0, 8)} from start...`, true);

  const all = await collectSessionAnchors(prefix, sessionId);
  const ordered = await buildOrderedChain(all);

  if (!ordered.length) {
    replayState.inProgress = false;
    $('startSpectatorBtn').disabled = false;
    $('replaySpectatorBtn').disabled = false;
    $('stopSpectatorBtn').disabled = true;
    setStatus('spectatorStatus', 'Replay Failed', 'disconnected');
    log('spectatorLogPanel', 'Replay failed: no messages found.', false);
    return;
  }

  if (typeof ordered[0].startX === 'number' && typeof ordered[0].startY === 'number') {
    state.spectatorPos = { x: ordered[0].startX, y: ordered[0].startY };
    updateSpectatorGrid();
  }

  state.spectatorLatency = { last: null, avg: null, max: null, count: 0, sum: 0 };
  setSpectatorBadges();

  applyMovesAnimated(ordered, 75);
}