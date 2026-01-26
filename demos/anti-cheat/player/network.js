import { $ } from '../dom_elements.js';
import { state, portal } from '../state.js';
import { log } from '../utils.js';
import * as KKTP from '../kktp_lib.js';
import { autoFetchVRF } from '../vrf_sources.js';

async function buildKKTPMessage() {
  if (!state.sessionId) return null;
  if (!state.roundMovesPacked || state.roundMovesPacked.length === 0) return null;

  // Lock the starting Move ID for this specific batch
  if (state.roundSeq0 === null || state.roundSeq0 === undefined) {
    state.roundSeq0 = state.totalMovesSent || 0;
  }

  // We save these to local variables so the loop can use them
  // even after encryption happens.
  const moveCountInBatch = state.roundMovesPacked.length;
  const currentSeq0 = state.roundSeq0;

  const gameData = {
    sid: state.sessionId,
    t0: state.roundT0 ?? Date.now(),
    moves: state.roundMovesPacked,
    dts: state.roundMoveDts.slice(),
    seq0: currentSeq0
  };

  const msg = KKTP.encryptMessage(
    state.kktp.kSession,
    state.kktp.mailboxId,
    "AtoB",
    state.kktp.seq + 1,
    gameData
  );

  // Return the msg PLUS the metadata needed to manage the buffer
  return { msg, moveCountInBatch, currentSeq0 };
}

export async function publishGameLoop() {
  if (!state.walletReady || state.anchorInFlight) return;

  const result = await buildKKTPMessage();
  if (!result) return;

  // Destructure the metadata we preserved BEFORE encryption
  const { msg, moveCountInBatch, currentSeq0 } = result;

  try {
    state.anchorInFlight = true;

    // Log using our preserved metadata
    log('anchorTxPanel', `Sending KKTP Msg #${msg.seq} (Moves ${currentSeq0} to ${currentSeq0 + moveCountInBatch - 1})...`);

    await portal.send({
      amount: '0.2',
      toAddress: state.walletAddress,
      payload: KKTP.buildKKTPPayload('KKTP:', msg),
    });

    log('anchorTxPanel', `✓ Sent Msg #${msg.seq}`);

    // SUCCESS: Advance the global state
    state.kktp.seq++;
    state.totalMovesSent = currentSeq0 + moveCountInBatch;

    // Slice exactly what we sent
    state.roundMovesPacked = state.roundMovesPacked.slice(moveCountInBatch);
    state.roundMoveDts = state.roundMoveDts.slice(moveCountInBatch);

    // Reset for next anchor
    state.roundSeq0 = state.totalMovesSent;
    state.roundT0 = Date.now();

  } catch (err) {
    log('anchorTxPanel', `✗ Send failed: ${err.message}`);
    // No increment, no slice. Everything stays in buffer for retry.
  } finally {
    state.anchorInFlight = false;
  }
}

export async function performKKTPHandshake() {
  log('anchorTxPanel', 'Starting KKTP Handshake...');

  // 1. Generate Keys
  state.kktp.identity = await KKTP.generateIdentityKey();
  state.kktp.session = await KKTP.generateSessionKey();

  // 1b. Enforce VRF Value (Public Seed)
  if (!state.foldedOutput) {
    log('anchorTxPanel', 'VRF not ready, attempting fetch...');
    try {
      await autoFetchVRF();
    } catch (e) {
      log('anchorTxPanel', '❌ Handshake Aborted: No VRF.');
      throw new Error("VRF required for handshake.");
    }
  }
  const vrfValue = state.foldedOutput;
  log('anchorTxPanel', 'Using folded VRF output for session key derivation.');

  // 2. Create Discovery Anchor
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

  // 3. Simulate Peer (Responder) for demo purposes
  const peerIdentity = await KKTP.generateIdentityKey();
  const peerSession = await KKTP.generateSessionKey();
  const response = await KKTP.createResponseAnchor(discovery, peerIdentity, peerSession);

  // 4. Publish Anchors (Bundled for speed in demo, usually separate)
  const prefix = $('payloadPrefix')?.value || 'KKTP';
  const payload = `${prefix}:ANCHOR:${KKTP.canonicalStringify({ anchors: [discovery, response] })}`;

  await portal.send({
    amount: '0.2',
    toAddress: state.walletAddress,
    payload
  });

  // 5. Derive Session Keys
  const secrets = KKTP.derivePublicSessionSecrets(vrfValue, state.sessionId, state.kktp.identity.pub, peerIdentity.pub);
  state.kktp.kSession = secrets.kSession;
  state.kktp.mailboxId = secrets.mailboxId;

  log('anchorTxPanel', `KKTP Session Established (Public). Mailbox: ${state.kktp.mailboxId.slice(0,8)}...`);
}
