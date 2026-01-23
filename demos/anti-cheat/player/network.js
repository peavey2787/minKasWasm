import { $ } from '../dom_elements.js';
import { state } from '../state.js';
import { log } from '../utils.js';
import * as KKTP from '../kktp_lib.js';

async function buildKKTPMessage() {
  if (!state.sessionId) return null;
  if (!state.roundMovesPacked || state.roundMovesPacked.length === 0) return null;

  // Construct game data payload
  const gameData = {
    sid: state.sessionId,
    t0: state.roundT0 ?? Date.now(),
    moves: state.roundMovesPacked,
    dts: state.roundMoveDts.slice(),
    seq0: state.roundSeq0 ?? 0
  };

  // Encrypt using KKTP
  // Atomic Sequence: Do not increment state.kktp.seq yet. Use next sequence for encryption.
  const msg = KKTP.encryptMessage(
    state.kktp.kSession,
    state.kktp.mailboxId,
    "AtoB", // Player is Initiator (A)
    state.kktp.seq + 1,
    gameData
  );

  return msg;
}

export async function publishGameLoop() {
  if (!state.walletReady) return;
  if (state.anchorInFlight) return;

  const msg = await buildKKTPMessage();
  if (!msg) return;

  const prefix = $('payloadPrefix')?.value || 'KKTP';
  const payload = KKTP.buildKKTPPayload(prefix + ':', msg);

  try {
    state.anchorInFlight = true;
    log('anchorTxPanel', `Sending KKTP Msg #${msg.seq} (${msg.ciphertext.length / 2} bytes)...`);

    await state.portal.send({
      amount: '0.2',
      toAddress: state.walletAddress,
      payload,
    });
    log('anchorTxPanel', `✓ Sent Msg #${msg.seq}`);

    // Success: Atomic Increment & Clear buffer
    state.kktp.seq++; 
    state.roundMovesPacked = '';
    state.roundMoveDts = [];
    state.roundT0 = null;
    state.roundSeq0 = null;
  } catch (err) {
    log('anchorTxPanel', `✗ Send failed: ${err.message}`);
    // Failure: Keep buffer for retry. 
    // Do NOT increment sequence. Next attempt will reuse the same sequence number.
  } finally {
    state.anchorInFlight = false;
  }
}

export async function performKKTPHandshake() {
  log('anchorTxPanel', 'Starting KKTP Handshake...');
  
  // 1. Generate Keys
  state.kktp.identity = await KKTP.generateIdentityKey();
  state.kktp.session = await KKTP.generateSessionKey();
  
  // 1b. Get VRF Value (Public Seed)
  let vrfValue = state.foldedOutput;
  if (!vrfValue) {
      // Generate a random one for demo purposes if user didn't fold
      const rnd = new Uint8Array(32);
      crypto.getRandomValues(rnd);
      vrfValue = KKTP.bytesToHex(rnd);
      log('anchorTxPanel', 'Generated ephemeral VRF value (no folded output found).');
  } else {
      log('anchorTxPanel', 'Using folded VRF output for session key derivation.');
  }

  // 2. Create Discovery Anchor
  const discovery = await KKTP.createDiscoveryAnchor(
    state.sessionId, 
    state.kktp.identity, 
    state.kktp.session,
    { game: "anti-cheat-demo", startX: state.playerStartPos.x, startY: state.playerStartPos.y },
    vrfValue
  );
  
  // 3. Simulate Peer (Responder) for demo purposes
  const peerIdentity = await KKTP.generateIdentityKey();
  const peerSession = await KKTP.generateSessionKey();
  const response = await KKTP.createResponseAnchor(discovery, peerIdentity, peerSession);
  
  // 4. Publish Anchors (Bundled for speed in demo, usually separate)
  const prefix = $('payloadPrefix')?.value || 'KKTP';
  const payload = `${prefix}:ANCHOR:${KKTP.canonicalStringify({ anchors: [discovery, response] })}`;
  
  await state.portal.send({
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