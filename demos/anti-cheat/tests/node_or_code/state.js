export const diagState = {
  // connection
  connected: false,
  networkId: null,
  nodeUrl: null,

  // wrapper objects
  client: null,
  scanner: null,

  // wallet
  walletReady: false,
  walletAddress: null,
  walletBalanceMature: null,

  // send pacing (calibrated)
  sendQueueMinSpacingMs: 250,
  lastCalibration: null,

  // block-rate
  blockEventTimes: [], // performance.now() timestamps

  // run control
  runAbort: null,

  // test stats
  sent: 0,
  sendOk: 0,
  detected: 0,
  missing: 0,
  noDecoded: 0,
  latencies: [],

  // mapping
  sendDoneAtBySeq: new Map(),
  detectedAtBySeq: new Map(),

  // last results
  results: null,
};

export function resetRunStats() {
  diagState.sent = 0;
  diagState.sendOk = 0;
  diagState.detected = 0;
  diagState.missing = 0;
  diagState.noDecoded = 0;
  diagState.latencies = [];
  diagState.sendDoneAtBySeq.clear();
  diagState.detectedAtBySeq.clear();
  diagState.results = null;
}

export function recordBlockTick() {
  const now = performance.now();
  diagState.blockEventTimes.push(now);
  // keep 10s window
  diagState.blockEventTimes = diagState.blockEventTimes.filter(t => now - t <= 10_000);
}

export function blocksPerSecond10s() {
  // count over 10 seconds window
  return diagState.blockEventTimes.length / 10;
}
