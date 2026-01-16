// test_walk_forward_to_present.js
// Production-grade test for walking the DAG forward to present
import { walkDagToPresent } from '../../wrapper/dag_walk.js';
import { connect } from '../../wrapper/kaspa_client.js';


export async function runTestWalkForwardToPresent(arg1, arg2) {
  const opts = (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1))
    ? arg1
    : { logFn: arg1, startHash: arg2 };

  const {
    logFn,
    startHash: providedStartHash,
    maxSeconds = 5,
    minTimestamp = 0,
    networkId = 'mainnet'
  } = opts;

  const streamLogFn = typeof logFn === 'function' ? logFn : null;
  const log = (msg) => {
    try {
      if (streamLogFn) streamLogFn(msg);
    } catch {
      // ignore
    }
    try {
      console.log(msg);
    } catch {
      // ignore
    }
  };
  log('[INIT] Connecting to Kaspa node...');
  let client;
  try {
    client = await connect(null, networkId);
    log(`[OK] Connected to Kaspa ${networkId}`);
  } catch (err) {
    log(`[ERROR] Failed to connect: ${err.message}`);
    return '[FAIL] Could not connect to Kaspa node.';
  }

  // Use supplied block hash or fallback
  const startHash = typeof providedStartHash === 'string' && providedStartHash.length === 64
    ? providedStartHash
    : '0000000000000000000000000000000000000000000000000000000000000001';
  let blockCount = 0;
  let firstBlock = null;
  let lastBlock = null;
  log(`[START] Walking DAG forward from hash: ${startHash}`);
  try {
    await walkDagToPresent({
      client,
      startHash,
      maxSeconds,
      minTimestamp,
      logFn: log,
      onBlock: (block) => {
        blockCount++;
        if (!firstBlock) firstBlock = block;
        lastBlock = block;
        const hash = block.hash || block.header?.hash || '';
        log(`[BLOCK ${blockCount}] Hash: ${hash.slice(0,8)}... BlueScore: ${block.header?.blueScore} Txs: ${block.transactions?.length}`);
      }
    });
  } catch (err) {
    log(`[ERROR] DAG walk failed: ${err.message}`);
    return '[FAIL] DAG walk failed.';
  }
  if (blockCount === 0) {
    log('[WARN] No blocks found during DAG walk.');
    return '[FAIL] No blocks found.';
  }
  log(`[COMPLETE] Walked ${blockCount} blocks forward to present.`);
  log(`[SUMMARY] First block: ${(firstBlock?.hash || firstBlock?.header?.hash || '').slice(0,8)}... | Last block: ${(lastBlock?.hash || lastBlock?.header?.hash || '').slice(0,8)}...`);
  return `[PASS] Walked ${blockCount} blocks forward to present.`;
}
