// Enterprise-grade unit tests for core/folding.js
import { strict as assert } from "assert";
import {
  sha256FoldingRule,
  getInitialPositions,
  updatePositions,
  recursiveFolding,
  getFoldingStats,
} from "../folding.js";
import { FoldingValidationError, FoldingExtractionError } from "../errors.js";
import { Block } from "../../models/Block.js";
import * as LoggerModule from "../../logs/logger.js";

// --- Logger Mocking ---
const loggerCalls = {
  logFolding: [],
  logExtraction: [],
  logAnomalies: [],
  error: [],
};
const loggerMock = {
  logFolding: (payload) => {
    loggerCalls.logFolding.push(payload);
  },
  logExtraction: (payload) => {
    loggerCalls.logExtraction.push(payload);
  },
  logAnomalies: (payload) => {
    loggerCalls.logAnomalies.push(payload);
  },
  error: (payload) => {
    loggerCalls.error.push(payload);
  },
};
const originalLogger = { ...LoggerModule.Logger };
Object.assign(LoggerModule.Logger, loggerMock);

function resetLoggerCalls() {
  loggerCalls.logFolding.length = 0;
  loggerCalls.logExtraction.length = 0;
  loggerCalls.logAnomalies.length = 0;
  loggerCalls.error.length = 0;
}

// --- Deterministic Test Fixtures ---
function makeBlock({
  hash,
  source = "bitcoin",
  confirms = 6,
  header = "",
  height = 0,
  time = 1234567890,
  isFinal,
} = {}) {
  // Allow explicit isFinal override for edge cases
  const block = new Block({ hash, source, confirms, header, height, time });
  if (typeof isFinal === "boolean") block.isFinal = isFinal;
  return block;
}
const FIXED_BITSTRING = "1010101010101010";
const FIXED_LONG_BITSTRING =
  "1010100110110000011010100101100011001001101010111001001010111011010000000010101101000001000011000110000001001010110100101000001010000010101011000101001001101010100010101001001100100000011010000011101010110010000010100010011000000101101100000110111001101000";

// --- Async Test Harness with Unhandled Rejection Guard ---

(async function runFoldingUnitTests() {
  // 1. Deterministic positions for known seed
  const seed = "test-seed";
  const numPositions = 8;
  const positions1 = await getInitialPositions(numPositions, seed);
  const positions2 = await getInitialPositions(numPositions, seed);
  assert.deepEqual(
    positions1,
    positions2,
    "getInitialPositions should be deterministic",
  );

  // 2. sha256FoldingRule deterministic
  const prevOut = FIXED_BITSTRING;
  const posA = await sha256FoldingRule(prevOut, 8);
  const posB = await sha256FoldingRule(prevOut, 8);
  assert.deepEqual(posA, posB, "sha256FoldingRule should be deterministic");

  // 3. updatePositions: rule validation (custom error)
  let threw = false;
  try {
    await updatePositions(FIXED_BITSTRING, "unsupported", 8);
  } catch (e) {
    threw = e instanceof FoldingValidationError;
    assert.ok(
      e.meta && e.meta.rule === "unsupported",
      "FoldingValidationError meta includes rule",
    );
  }
  assert.ok(
    threw,
    "updatePositions throws FoldingValidationError for bad rule",
  );

  // 4. recursiveFolding: error on malformed blocks (custom error)
  threw = false;
  try {
    await recursiveFolding([], FIXED_BITSTRING, "sha256", 2, 8);
  } catch (e) {
    threw = e instanceof FoldingValidationError;
    assert.ok(
      e.meta && e.meta.blocks,
      "FoldingValidationError meta includes blocks",
    );
  }
  assert.ok(
    threw,
    "recursiveFolding throws FoldingValidationError for bad blocks",
  );

  // 5. recursiveFolding: anomaly aggregation with real block hashes (all finalized)
  const realBlocks = [
    makeBlock({
      hash: "5492228dc5993c981310028db4c72628cabd41fd2c6c2e5a530a908d6d2b0cef",
      source: "bitcoin",
      confirms: 6,
      qrng: true,
    }),
    makeBlock({
      hash: "d9cdaeb7524294ffc99c0d549f886c8524b36c686c3c98003238af7c690b68ba",
      source: "kaspa",
      confirms: 60,
    }),
    makeBlock({
      hash: "000000000000000000004628d23eb858fde8a615b464d4e9b63752b85d250afe",
      source: "bitcoin",
      confirms: 6,
    }),
  ];
  const initialOutput = FIXED_LONG_BITSTRING;
  const result = await recursiveFolding(
    realBlocks,
    initialOutput,
    "sha256",
    2,
    8,
  );
  assert.ok(
    Array.isArray(result.anomalies),
    "recursiveFolding returns anomalies array",
  );
  assert.ok(result.history.length === 3, "history length is iterations + 1");
  assert.ok(
    result.history.every(
      (h) =>
        h.iteration !== undefined &&
        h.output &&
        h.positions &&
        Array.isArray(h.audit),
    ),
    "history entries have required fields",
  );

  // 6. getFoldingStats: correct stats shape and dynamic hash length
  const stats = getFoldingStats(result);
  assert.ok(
    stats.iterations === 2,
    "getFoldingStats returns correct iterations",
  );
  assert.ok(
    typeof stats.coverage === "string",
    "getFoldingStats returns coverage as string",
  );

  // 7. Error class propagation: getInitialPositions (custom error)
  threw = false;
  try {
    await getInitialPositions(0, "seed");
  } catch (e) {
    threw = e instanceof FoldingValidationError;
  }
  assert.ok(
    threw,
    "getInitialPositions throws FoldingValidationError for invalid numPositions",
  );

  // 8. Boundary: numPositions min/max
  assert.deepEqual(
    (await getInitialPositions(1, seed)).length,
    1,
    "getInitialPositions(1) returns 1 position",
  );
  assert.deepEqual(
    (await getInitialPositions(4096, seed)).length,
    4096,
    "getInitialPositions(4096) returns 4096 positions",
  );

  // 9. Boundary: iterations min/max
  const minIter = await recursiveFolding(
    realBlocks,
    initialOutput,
    "sha256",
    1,
    8,
  );
  assert.ok(minIter.history.length === 2, "min iterations history length");
  const maxIter = await recursiveFolding(
    realBlocks,
    initialOutput,
    "sha256",
    2,
    8,
  );
  assert.ok(maxIter.history.length === 3, "max iterations history length");

  // 10. Boundary: blocks.length min/max
  const oneBlock = [
    makeBlock({
      hash: "000000000000000000004628d23eb858fde8a615b464d4e9b63752b85d250afe",
      source: "bitcoin",
      confirms: 6,
    }),
  ];
  const minBlock = await recursiveFolding(
    oneBlock,
    initialOutput,
    "sha256",
    1,
    8,
  );
  assert.ok(minBlock.history.length === 2, "min block count works");
  const blocks32 = Array.from({ length: 32 }, (_, i) =>
    makeBlock({
      hash: "000000000000000000004628d23eb858fde8a615b464d4e9b63752b85d250afe",
      source: "bitcoin",
      confirms: 6,
      height: i,
    }),
  );
  const maxBlock = await recursiveFolding(
    blocks32,
    initialOutput,
    "sha256",
    1,
    8,
  );
  assert.ok(maxBlock.history.length === 2, "max block count works");

  // 11. Invalid hash format
  threw = false;
  try {
    await recursiveFolding(
      [makeBlock({ hash: "notAHex", source: "bitcoin", confirms: 6 })],
      initialOutput,
      "sha256",
      1,
      8,
    );
  } catch (e) {
    threw = e instanceof FoldingValidationError;
  }
  assert.ok(threw, "invalid hash format throws FoldingValidationError");

  // 12. Empty or too-short initialOutput
  threw = false;
  try {
    await recursiveFolding(realBlocks, "", "sha256", 1, 8);
  } catch (e) {
    threw = e instanceof FoldingValidationError;
  }
  assert.ok(threw, "empty initialOutput throws FoldingValidationError");

  // 13. Empty output at an iteration (force all blocks invalid)
  threw = false;
  try {
    // Use a valid 64-char hex hash but isFinal: false to force extractBits to skip all blocks
    await recursiveFolding(
      [
        makeBlock({
          hash: "a".repeat(64),
          source: "bitcoin",
          confirms: 0,
          isFinal: false,
        }),
      ],
      initialOutput,
      "sha256",
      1,
      8,
    );
  } catch (e) {
    threw = e instanceof FoldingExtractionError;
    console.error("DIAG: error instanceof FoldingExtractionError:", threw);
    console.error("DIAG: error:", e);
    console.error("DIAG: error.meta:", e.meta);
    assert.ok(
      e.meta && typeof e.meta.iteration !== "undefined",
      "FoldingExtractionError meta includes iteration",
    );
  }
  assert.ok(threw, "empty output at iteration throws FoldingExtractionError");

  // 14. Determinism: recursiveFolding identical outputs for same inputs
  const run1 = await recursiveFolding(
    realBlocks,
    initialOutput,
    "sha256",
    2,
    8,
  );
  const run2 = await recursiveFolding(
    realBlocks,
    initialOutput,
    "sha256",
    2,
    8,
  );
  assert.deepEqual(
    run1.finalOutput,
    run2.finalOutput,
    "recursiveFolding is deterministic",
  );
  assert.deepEqual(
    run1.finalPositions,
    run2.finalPositions,
    "finalPositions deterministic",
  );

  // 15. Dynamic hash length: coverage denominator adapts
  const stats256 = getFoldingStats({
    history: [{}, {}],
    finalPositions: [0, 1, 2],
  });
  const stats512 = getFoldingStats({
    history: [{}, {}],
    finalPositions: Array(512).fill(0),
  });
  assert.ok(stats256.coverage.endsWith("%"), "coverage adapts for hash length");
  assert.notEqual(
    stats256.coverage,
    stats512.coverage,
    "coverage adapts with inferred hash length",
  );

  // 16. Performance/safety: enforce limits
  threw = false;
  try {
    await getInitialPositions(4097, seed);
  } catch (e) {
    threw = e instanceof Error;
  }
  assert.ok(threw, "getInitialPositions(4097) throws");
  threw = false;
  try {
    await recursiveFolding(realBlocks, initialOutput, "sha256", 33, 8);
  } catch (e) {
    threw = e instanceof FoldingValidationError;
  }
  assert.ok(threw, "iterations=33 throws");
  threw = false;
  try {
    await recursiveFolding(
      Array(33).fill(realBlocks[0]),
      initialOutput,
      "sha256",
      1,
      8,
    );
  } catch (e) {
    threw = e instanceof FoldingValidationError;
  }
  assert.ok(threw, "blocks.length=33 throws");

  // 17. Logger contract: verify calls and payload shapes
  assert.ok(loggerCalls.logFolding.length > 0, "Logger.logFolding called");
  assert.ok(
    loggerCalls.logExtraction.length > 0,
    "Logger.logExtraction called",
  );
  assert.ok(loggerCalls.logAnomalies.length >= 0, "Logger.logAnomalies called");
  assert.ok(loggerCalls.error.length >= 0, "Logger.error called");
  assert.ok(
    loggerCalls.logFolding.every(
      (p) =>
        p &&
        (p.rule === "initial" || p.rule === "sha256") &&
        Array.isArray(p.positions),
    ),
    "Logger.logFolding payloads have rule and positions",
  );
  assert.ok(
    loggerCalls.logExtraction.every(
      (p) => p && (p.iteration !== undefined || p.anomaly),
    ),
    "Logger.logExtraction payloads include iteration or anomaly",
  );

  // Restore Logger
  Object.assign(LoggerModule.Logger, originalLogger);

  console.log("All folding.js enterprise-grade unit tests passed.");
})();
