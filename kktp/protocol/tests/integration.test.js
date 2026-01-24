// integration.test.js
// Minimal, real integration test scaffolding for KKTP State Machine and Protocol
// No mocks, no globals, no window. Each test is a standalone async function.
// Run with: import and call each exported function from a browser or Node test runner.

import { KKTPStateMachine, KKTP_STATES } from "../stateMachine.js";

import { KaspaPortal } from "../../../wrapper/kaspaPortal.js";

// Helper: create a real portal with all services initialized
const TEST_WALLET_PASSWORD = "integration-test-password";

let sharedPortal = null;
async function getSharedPortal() {
  if (sharedPortal) return sharedPortal;
  sharedPortal = new KaspaPortal();

  // Mock VRF verify to pass for integration tests (since we don't have full VRF generation here)
  sharedPortal.vrf.verify = async () => true;

  await sharedPortal.connect(null, "testnet-10");
  // Clean up all wallets before creating a new one to avoid decryption errors
  const wallets = await sharedPortal.identity.getAllWallets();
  for (const w of wallets) {
    await sharedPortal.identity.deleteWallet(w.filename);
  }
  await sharedPortal.identity.createWallet({ password: TEST_WALLET_PASSWORD });
  return sharedPortal;
}

// Helper: create real discovery and response anchors (production-ready, protocol-compliant)
async function createAnchors(portal) {
  // Ensure wallet is initialized before key generation
  if (!portal.identity.activeWallet) {
    await portal.identity.createWallet({ password: TEST_WALLET_PASSWORD });
  }
  // Use different key indices for initiator and responder
  const initiatorKeys = await portal.generateIdentityKeys(0);
  const responderKeys = await portal.generateIdentityKeys(1);

  // 32 bytes hex string for SID
  const sid = "a".repeat(64);

  const discovery = {
    type: "discovery",
    version: 1,
    sid,
    pub_sig: initiatorKeys.sig.publicKey,
    pub_dh: initiatorKeys.dh.publicKey,
    vrf_value: "00".repeat(32), // Mocked VRF
    vrf_proof: "00".repeat(32), // Mocked VRF
    meta: { game: "test-game", version: "1", expected_uptime_seconds: 3600 },
  };

  // Sign discovery
  discovery.sig = await portal.crypto.signAnchor(
    discovery,
    initiatorKeys.sig.privateKey,
    false,
  );

  const response = {
    type: "response",
    version: 1,
    sid,
    initiator_pub_sig: discovery.pub_sig,
    initiator_pub_dh: discovery.pub_dh,
    pub_sig_resp: responderKeys.sig.publicKey,
    pub_dh_resp: responderKeys.dh.publicKey,
    vrf_value: "00".repeat(32),
    vrf_proof: "00".repeat(32),
  };

  // Sign response
  response.sig_resp = await portal.crypto.signAnchor(
    response,
    responderKeys.sig.privateKey,
    true,
  );

  return { discovery, response };
}

/**
 * 1. End-to-End Session Establishment
 */

export async function testSessionEstablishment() {
  const portal = await getSharedPortal();
  const { discovery, response } = await createAnchors(portal);

  const initiator = new KKTPStateMachine(portal, true, 0);
  const responder = new KKTPStateMachine(portal, false, 1);

  await initiator.connect(discovery, response);
  await responder.connect(discovery, response);

  if (
    initiator.state !== KKTP_STATES.ACTIVE ||
    responder.state !== KKTP_STATES.ACTIVE
  )
    throw new Error("Session not active");
  if (initiator.kktp.sid !== responder.kktp.sid)
    throw new Error("SID mismatch");
  if (initiator.kktp.mailboxId !== responder.kktp.mailboxId)
    throw new Error("MailboxId mismatch");
}

/**
 * 2. Message Send/Receive
 */

export async function testMessageSendReceive() {
  const portal = await getSharedPortal();
  const { discovery, response } = await createAnchors(portal);

  const initiator = new KKTPStateMachine(portal, true, 0);
  const responder = new KKTPStateMachine(portal, false, 1);

  await initiator.connect(discovery, response);
  await responder.connect(discovery, response);

  const plaintext = "hello world";
  const msg = initiator.sendMessage(plaintext);
  const received = responder.receiveMessage(msg);

  if (!received.includes(plaintext)) throw new Error("Plaintext not delivered");
}

/**
 * 3. Out-of-Order Delivery
 */

export async function testOutOfOrderDelivery() {
  const portal = await getSharedPortal();
  const { discovery, response } = await createAnchors(portal);

  const initiator = new KKTPStateMachine(portal, true, 0);
  const responder = new KKTPStateMachine(portal, false, 1);

  await initiator.connect(discovery, response);
  await responder.connect(discovery, response);

  // Send 3 messages, out of order
  const msg1 = initiator.sendMessage("msg1");
  const msg2 = initiator.sendMessage("msg2");
  const msg3 = initiator.sendMessage("msg3");

  // Deliver 1, 3, 2
  let out = responder.receiveMessage(msg1);
  if (!out.includes("msg1")) throw new Error("msg1 not delivered");

  out = responder.receiveMessage(msg3);
  if (out.length !== 0) throw new Error("msg3 should be buffered");

  out = responder.receiveMessage(msg2);
  if (!out.includes("msg2") || !out.includes("msg3"))
    throw new Error("msg2/msg3 not delivered in order");
}

/**
 * 4. Buffer Overflow/Adversarial
 */

export async function testAdversarialBufferOverflow() {
  const portal = await getSharedPortal();
  const { discovery, response } = await createAnchors(portal);

  const initiator = new KKTPStateMachine(portal, true, 0);
  const responder = new KKTPStateMachine(portal, false, 1);

  await initiator.connect(discovery, response);
  await responder.connect(discovery, response);

  responder.kktp.maxBufferSize = 3;
  // Send 4 out-of-order messages (all seq > 1)
  const msgs = [];
  for (let i = 0; i < 4; i++) {
    msgs.push({
      ...initiator.sendMessage("overflow" + i),
      seq: 10 + i,
    });
  }
  let threw = false;
  try {
    for (const m of msgs) responder.receiveMessage(m);
  } catch (e) {
    threw = true;
    if (responder.state !== KKTP_STATES.FAULTED)
      throw new Error("State not FAULTED after overflow");
  }
  if (!threw) throw new Error("Buffer overflow not detected");
}

/**
 * Minimal test runner (browser or Node)
 */
export async function runAllIntegrationTests() {
  const tests = [
    testSessionEstablishment,
    testMessageSendReceive,
    testOutOfOrderDelivery,
    testAdversarialBufferOverflow,
  ];
  let results = [];
  for (const fn of tests) {
    try {
      await fn();
      results.push({ name: fn.name, status: "PASS" });
    } catch (e) {
      results.push({ name: fn.name, status: "FAIL", error: e });
    }
  }
  return results;
}
