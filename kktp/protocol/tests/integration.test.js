import { KKTPStateMachine, KKTP_STATES } from "../stateMachine.js";
import { kaspaPortal } from "../../../wrapper/kaspaPortal.js";

const TEST_WALLET_PASSWORD = "integration-test-password";

/**
 * Helper: Creates real, signed discovery and response anchors
 * utilizing the Portal and Protocol facades.
 */
async function createAnchors() {
  await kaspaPortal.connect({ networkId: "testnet-10" });

  await kaspaPortal.identity.createOrOpenWallet({
    password: TEST_WALLET_PASSWORD,
  });

  // Required meta fields for KKTP anchors
  const meta = {
    game: "integration-test",
    version: "1.0.0",
    upTime: 3600, // or whatever is appropriate for your test
  };

  // Pass meta to the factory methods
  const { discovery, dhPrivateKey: initiatorDhPriv } =
    await kaspaPortal.kktpProtocol.createDiscoveryAnchor(meta);

  const { response, dhPrivateKey: responderDhPriv } =
    await kaspaPortal.kktpProtocol.createResponseAnchor(discovery);

  return { discovery, response, initiatorDhPriv, responderDhPriv };
}

/**
 * 1. End-to-End Session Establishment
 */
export async function testSessionEstablishment() {
  const { discovery, response, initiatorDhPriv, responderDhPriv } =
    await createAnchors();

  const initiator = new KKTPStateMachine(kaspaPortal, true, 0);
  const responder = new KKTPStateMachine(kaspaPortal, false, 1);

  initiator.kktp.myDhPriv = initiatorDhPriv;
  responder.kktp.myDhPriv = responderDhPriv;

  await initiator.connect(discovery, response);
  await responder.connect(discovery, response);

  if (
    initiator.state !== KKTP_STATES.ACTIVE ||
    responder.state !== KKTP_STATES.ACTIVE
  )
    throw new Error("Session failed to reach ACTIVE state");

  if (initiator.kktp.mailboxId !== responder.kktp.mailboxId)
    throw new Error("Mailbox ID derivation mismatch");
}

/**
 * 2. Message Send/Receive (Encryption/Decryption Test)
 */
export async function testMessageSendReceive() {
  const { discovery, response, initiatorDhPriv, responderDhPriv } =
    await createAnchors();

  const initiator = new KKTPStateMachine(kaspaPortal, true, 0);
  const responder = new KKTPStateMachine(kaspaPortal, false, 1);

  initiator.kktp.myDhPriv = initiatorDhPriv;
  responder.kktp.myDhPriv = responderDhPriv;

  await initiator.connect(discovery, response);
  await responder.connect(discovery, response);

  const plaintext = "Secret Handshake";
  const msg = initiator.sendMessage(plaintext);
  const received = responder.receiveMessage(msg);

  if (!received.includes(plaintext))
    throw new Error("Decryption failed or message lost");
}

/**
 * 3. Out-of-Order Delivery
 */

export async function testOutOfOrderDelivery() {
  const { discovery, response, initiatorDhPriv, responderDhPriv } =
    await createAnchors();

  const initiator = new KKTPStateMachine(kaspaPortal, true, 0);
  const responder = new KKTPStateMachine(kaspaPortal, false, 1);

  initiator.kktp.myDhPriv = initiatorDhPriv;
  responder.kktp.myDhPriv = responderDhPriv;

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
  const { discovery, response, initiatorDhPriv, responderDhPriv } =
    await createAnchors();

  const initiator = new KKTPStateMachine(kaspaPortal, true, 0);
  const responder = new KKTPStateMachine(kaspaPortal, false, 1);

  initiator.kktp.myDhPriv = initiatorDhPriv;
  responder.kktp.myDhPriv = responderDhPriv;

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
