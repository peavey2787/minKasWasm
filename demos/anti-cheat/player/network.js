import { $ } from '../dom_elements.js';
import { state } from '../state.js';
import { log } from '../utils.js';
import * as KKTP from '../kktp_lib.js';

async function buildKKTPMessage() {
  if (!state.sessionId) return null;
  if (!state.roundMovesPacked || state.roundMovesPacked.length === 0) return null;

  // Lock the starting Move ID for this batch if not already locked
  if (state.roundSeq0 === null || state.roundSeq0 === undefined) {
    state.roundSeq0 = state.totalMovesSent || 0;
  }

  // Capture the count of moves we are CURRENTLY putting into the envelope
  const moveCountInBatch = state.roundMovesPacked.length;

  const gameData = {
    sid: state.sessionId,
    t0: state.roundT0 ?? Date.now(),
    moves: state.roundMovesPacked,
    dts: state.roundMoveDts.slice(),
    seq0: state.roundSeq0
  };

  // Encrypt using KKTP
  const msg = KKTP.encryptMessage(
    state.kktp.kSession,
    state.kktp.mailboxId,
    "AtoB", 
    state.kktp.seq + 1, 
    gameData
  );

  // Return both the message AND the count so we can slice correctly later
  return { msg, moveCountInBatch };
}

export async function publishGameLoop() {
  if (!state.walletReady) return;
  if (state.anchorInFlight) return;

  // Snapshot the current batch
  const result = await buildKKTPMessage();
  if (!result) return;

  const { msg, moveCountInBatch } = result;

  const prefix = $('payloadPrefix')?.value || 'KKTP';
  const payload = KKTP.buildKKTPPayload(prefix + ':', msg);

  try {
    state.anchorInFlight = true;
    log('anchorTxPanel', `Sending KKTP Msg #${msg.seq} (${moveCountInBatch} moves)...`);

    await state.portal.send({
      amount: '0.2',
      toAddress: state.walletAddress,
      payload,
    });
    
    log('anchorTxPanel', `✓ Sent Msg #${msg.seq}`);

    // SUCCESS: Commit counts and clear ONLY what was sent
    state.kktp.seq++; 
    state.totalMovesSent = state.roundSeq0 + moveCountInBatch;
    
    // Slice off only the moves that were confirmed in this block
    // Any moves made while the 'await' was pending remain for the next loop
    state.roundMovesPacked = state.roundMovesPacked.slice(moveCountInBatch);
    state.roundMoveDts = state.roundMoveDts.slice(moveCountInBatch);
    
    // Reset anchor-specific trackers
    state.roundT0 = Date.now();
    state.roundSeq0 = state.totalMovesSent;

  } catch (err) {
    log('anchorTxPanel', `✗ Send failed: ${err.message}`);
    // On failure, sequence numbers and buffers remain unchanged for retry
  } finally {
    state.anchorInFlight = false;
  }
}

export async function performKKTPHandshake() {
  log('anchorTxPanel', 'Starting KKTP Handshake...');
  
  state.kktp.identity = await KKTP.generateIdentityKey();
  state.kktp.session = await KKTP.generateSessionKey();
  
  let vrfValue = state.foldedOutput;
  if (!vrfValue) {
      const rnd = new Uint8Array(32);
      crypto.getRandomValues(rnd);
      vrfValue = KKTP.bytesToHex(rnd);
      log('anchorTxPanel', 'Generated ephemeral VRF value (no folded output found).');
  } else {
      log('anchorTxPanel', 'Using folded VRF output for session key derivation.');
  }

  const discovery = await KKTP.createDiscoveryAnchor(
    state.sessionId, 
    state.kktp.identity, 
    state.kktp.session,
    { 
      game: "anti-cheat-demo", 
      startX: state.playerStartPos.x, 
      startY: state.playerStartPos.y,
      timestamp: Date.now() 
    },
    vrfValue
  );
  
  const peerIdentity = await KKTP.generateIdentityKey();
  const peerSession = await KKTP.generateSessionKey();
  const response = await KKTP.createResponseAnchor(discovery, peerIdentity, peerSession);
  
  const prefix = $('payloadPrefix')?.value || 'KKTP';
  const payload = `${prefix}:ANCHOR:${KKTP.canonicalStringify({ anchors: [discovery, response] })}`;
  
  await state.portal.send({
    amount: '0.2',
    toAddress: state.walletAddress,
    payload
  });
  
  const secrets = KKTP.derivePublicSessionSecrets(vrfValue, state.sessionId, state.kktp.identity.pub, peerIdentity.pub);
  state.kktp.kSession = secrets.kSession;
  state.kktp.mailboxId = secrets.mailboxId;
  
  log('anchorTxPanel', `KKTP Session Established (Public). Mailbox: ${state.kktp.mailboxId.slice(0,8)}...`);
}