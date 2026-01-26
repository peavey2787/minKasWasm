import { KKTPStateMachine, KKTP_STATES } from "../stateMachine.js";
import { kaspaPortal } from "../../../wrapper/kaspaPortal.js";

const TEST_WALLET_PASSWORD = "integration-test-password";

// Ensure WASM is initialized before any portal usage
let _portalInitDone = false;
async function ensurePortalReady() {
  if (_portalInitDone) return;
  await kaspaPortal.init();
  _portalInitDone = true;
}

/**
 * Helper: Creates real, signed discovery and response anchors
 * utilizing the Portal and Protocol facades.
 */
async function createAnchors() {
  await ensurePortalReady();
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
export async function testSessionEstablishment(log = console.log) {
  const { discovery, response, initiatorDhPriv, responderDhPriv } =
    await createAnchors();

  log(`SID: ${discovery.sid}`, "crypto");
  log(`Mailbox ID: ${discovery.mailboxId}`, "crypto");

  const initiator = new KKTPStateMachine(kaspaPortal, true, 0);
  const responder = new KKTPStateMachine(kaspaPortal, false, 1);

  initiator.kktp.myDhPriv = initiatorDhPriv;
  responder.kktp.myDhPriv = responderDhPriv;

  log("Initiator connecting...", "info");
  await initiator.connect(discovery, response);
  log(`Initiator state: ${initiator.state}`, "info");

  log("Responder connecting...", "info");
  await responder.connect(discovery, response);
  log(`Responder state: ${responder.state}`, "info");

  if (
    initiator.state !== KKTP_STATES.ACTIVE ||
    responder.state !== KKTP_STATES.ACTIVE
  )
    throw new Error("Session failed to reach ACTIVE state");

  if (initiator.kktp.mailboxId !== responder.kktp.mailboxId)
    throw new Error("Mailbox ID derivation mismatch");

  log("Session established successfully", "success");
}

/**
 * 2. Message Send/Receive (Encryption/Decryption Test)
 */
export async function testMessageSendReceive(log = console.log) {
  const { discovery, response, initiatorDhPriv, responderDhPriv } =
    await createAnchors();

  log(`SID: ${discovery.sid}`, "crypto");
  log(`Mailbox ID: ${discovery.mailboxId}`, "crypto");

  const initiator = new KKTPStateMachine(kaspaPortal, true, 0);
  const responder = new KKTPStateMachine(kaspaPortal, false, 1);

  initiator.kktp.myDhPriv = initiatorDhPriv;
  responder.kktp.myDhPriv = responderDhPriv;

  log("Initiator connecting...", "info");
  await initiator.connect(discovery, response);
  log(`Initiator state: ${initiator.state}`, "info");

  log("Responder connecting...", "info");
  await responder.connect(discovery, response);
  log(`Responder state: ${responder.state}`, "info");

  const plaintext = "Secret Handshake";
  const msgStr = initiator.sendMessage(plaintext);
  const msg = typeof msgStr === "string" ? JSON.parse(msgStr) : msgStr;

  log(
    `Sent message seq: ${msg.seq}, ciphertext: ${(msg.ciphertext || "").slice(
      0,
      16,
    )}...`,
    "crypto",
  );

  const received = responder.receiveMessage(msg);
  log(
    `Received message seq: ${msg.seq}, plaintext: ${(received || "")
      .toString()
      .slice(0, 16)}...`,
    "crypto",
  );

  if (!received.includes(plaintext))
    throw new Error("Decryption failed or message lost");

  log("Message send/receive successful", "success");
}

/**
 * 3. Out-of-Order Delivery
 */
export async function testOutOfOrderDelivery(log = console.log) {
  const { discovery, response, initiatorDhPriv, responderDhPriv } =
    await createAnchors();

  log(`SID: ${discovery.sid}`, "crypto");
  log(`Mailbox ID: ${discovery.mailboxId}`, "crypto");

  const initiator = new KKTPStateMachine(kaspaPortal, true, 0);
  const responder = new KKTPStateMachine(kaspaPortal, false, 1);

  initiator.kktp.myDhPriv = initiatorDhPriv;
  responder.kktp.myDhPriv = responderDhPriv;

  log("Initiator connecting...", "info");
  await initiator.connect(discovery, response);
  log(`Initiator state: ${initiator.state}`, "info");

  log("Responder connecting...", "info");
  await responder.connect(discovery, response);
  log(`Responder state: ${responder.state}`, "info");

  // Send 3 messages, out of order
  const msg1 = JSON.parse(initiator.sendMessage("msg1"));
  const msg2 = JSON.parse(initiator.sendMessage("msg2"));
  const msg3 = JSON.parse(initiator.sendMessage("msg3"));

  // Deliver 1, 3, 2
  log(`Delivering seq: ${msg1.seq}`, "info");
  let out = responder.receiveMessage(msg1);
  if (!out.includes("msg1")) throw new Error("msg1 not delivered");

  log(`Delivering seq: ${msg3.seq} (should buffer)`, "info");
  out = responder.receiveMessage(msg3);
  if (out.length !== 0) throw new Error("msg3 should be buffered");
  else log(`Buffered seq: ${msg3.seq}`, "info");

  log(`Delivering seq: ${msg2.seq} (should release buffered)`, "info");
  out = responder.receiveMessage(msg2);
  if (!out.includes("msg2") || !out.includes("msg3"))
    throw new Error("msg2/msg3 not delivered in order");
  else log(`Delivered in order: ${out}`, "success");
}

/**
 * 4. Buffer Overflow/Adversarial
 */
export async function testAdversarialBufferOverflow(log = console.log) {
  const { discovery, response, initiatorDhPriv, responderDhPriv } =
    await createAnchors();

  log(`SID: ${discovery.sid}`, "crypto");
  log(`Mailbox ID: ${discovery.mailboxId}`, "crypto");

  const initiator = new KKTPStateMachine(kaspaPortal, true, 0);
  const responder = new KKTPStateMachine(kaspaPortal, false, 1);

  initiator.kktp.myDhPriv = initiatorDhPriv;
  responder.kktp.myDhPriv = responderDhPriv;

  log("Initiator connecting...", "info");
  await initiator.connect(discovery, response);
  log(`Initiator state: ${initiator.state}`, "info");

  log("Responder connecting...", "info");
  await responder.connect(discovery, response);
  log(`Responder state: ${responder.state}`, "info");

  responder.kktp.maxBufferSize = 3;
  // Send 4 out-of-order messages (all seq > 1)
  const msgs = [];
  for (let i = 0; i < 4; i++) {
    const m = {
      ...JSON.parse(initiator.sendMessage("overflow" + i)),
      seq: 10 + i,
    };
    msgs.push(m);
    log(
      `Prepared overflow msg seq: ${m.seq}, ciphertext: ${(
        m.ciphertext || ""
      ).slice(0, 16)}...`,
      "crypto",
    );
  }
  let threw = false;
  try {
    for (const m of msgs) {
      log(`Delivering overflow seq: ${m.seq}`, "info");
      responder.receiveMessage(m);
    }
  } catch (e) {
    threw = true;
    if (responder.state !== KKTP_STATES.FAULTED)
      throw new Error("State not FAULTED after overflow");
    log("Responder entered FAULTED state due to buffer overflow", "success");
  }
  if (!threw) throw new Error("Buffer overflow not detected");
}

/**
 * Minimal test runner (browser or Node)
 */
export async function runAllIntegrationTests(log = console.log) {
  const tests = [
    testSessionEstablishment,
    testMessageSendReceive,
    testOutOfOrderDelivery,
    testAdversarialBufferOverflow,
  ];
  let results = [];
  for (const fn of tests) {
    try {
      await fn(log);
      results.push({ name: fn.name, status: "PASS" });
    } catch (e) {
      results.push({ name: fn.name, status: "FAIL", error: e });
    }
  }
  return results;
}
