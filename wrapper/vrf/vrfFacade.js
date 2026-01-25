import { recursiveFolding } from "./core/folding.js";
import {
  getKaspaBlocks,
  getBitcoinBlocks,
  getQRNG,
} from "./core/fetcher/index.js";
import { hexToBinary, sha256Hash } from "./core/crypto.js";
import { setLoggerProvider } from "./core/logs/logger.js";
import { runNistSuite } from "./core/nist.js";
import { NistVerifier } from "./core/nistVerifier.js";
import { VRFProof } from "./core/models/vrfProof.js";
import { Block } from "./core/models/Block.js";

export class VRFFacade {

  /**
   * @param {boolean|object} logger - true for console, false for silent, or a custom logger object
   */
  constructor(logger = false) {
    setLoggerProvider(logger);
  }

  /**
   * Generates a high-entropy bitstring by folding QRNG, BTC, and Kaspa data.
   */
  async generateFoldedEntropy({
    btcBlocks = 1,
    kasBlocks = 1,
    iterations = 2,
    seed = "kktp-default-seed",
  } = {}) {
    const numPositions = 256;

    const [qrngBlock, kBlocks, bBlocks] = await Promise.all([
      getQRNG("nist", 32),
      getKaspaBlocks(kasBlocks),
      getBitcoinBlocks(btcBlocks),
    ]);

    const [qrng1, qrng2] = Block.fromNistSplit(qrngBlock);
    const sources = [qrng1, qrng2, ...kBlocks, ...bBlocks];

    const initialBits = /^[0-9a-fA-F]+$/.test(seed)
      ? hexToBinary(seed)
      : hexToBinary(await sha256Hash(seed));

    const result = await recursiveFolding(
      sources,
      initialBits,
      "sha256",
      iterations,
      numPositions,
    );

    const finalHex = await sha256Hash(result.finalOutput);

    // Build the proof using the ORIGINAL qrngBlock instance
    const proof = new VRFProof({
      nist: qrngBlock,
      kaspa: kBlocks,
      btc: bBlocks,
      finalOutput: finalHex,
      seed: seed,
      iterations: iterations,
    });

    return {
      finalOutput: finalHex,
      proof: proof,
    };
  }

  /**
   * PROVE: Generates a formalized VRF proof object.
   */
  async prove({seedInput, btcBlocks = 6, kasBlocks = 12, iterations = 2}) {
    const data = await this.generateFoldedEntropy({
      btcBlocks,
      kasBlocks,
      iterations,
      seed: seedInput,
    });
    return data.proof;
  }

  /**
   * VERIFY: Validates the value against the proof bundle.
   */
  async verify(valueOrResult, optionalProof) {
    let value, proof;

    // HANDLE PARAMETER OVERLOAD
    if (
      arguments.length === 1 &&
      valueOrResult.finalOutput &&
      valueOrResult.proof
    ) {
      // If user called: vrf.verify(foldedResult)
      value = valueOrResult.finalOutput;
      proof = valueOrResult.proof;
    } else {
      // If user called: vrf.verify(value, proof)
      value = valueOrResult;
      proof = optionalProof;
    }

    if (!proof) {
      throw new Error("Verification Failed: No proof object provided.");
    }

    // 1. Run NIST signature check
    const isNistValid = await this.isValidNistSignature(proof);
    if (!isNistValid) {
      throw new Error(
        "VRF Verification Failed: NIST Signature missing or invalid.",
      );
    }

    // 2. Reconstruct sources (using NIST hash from qrng evidence)
    const nistHash = proof.evidence?.nist?.outputValue || proof.qrng?.hash;
    if (!nistHash) throw new Error("Missing NIST entropy for reconstruction.");

    const entropySources = [
      { hash: nistHash.substring(0, 64) },
      { hash: nistHash.substring(64, 128) },
      ...proof.kaspa.map((b) => ({ hash: b.hash })),
      ...proof.btc.map((b) => ({ hash: b.hash })),
    ];

    const initialBits = /^[0-9a-fA-F]+$/.test(proof.config.seed)
      ? hexToBinary(proof.config.seed)
      : hexToBinary(await sha256Hash(proof.config.seed));

    const result = await recursiveFolding(
      entropySources,
      initialBits,
      "sha256",
      proof.config.iterations,
      proof.config.numPositions || 256,
    );

    return result.finalOutput === value;
  }

  /**
   * Verify NIST Signature authenticity
   */
  async isValidNistSignature(proof) {
    // Ensure we drill into evidence.nist
    let nistBlock = proof.evidence?.nist;

    // Handle the "Array" edge case from the QRNG split
    if (Array.isArray(nistBlock)) {
      nistBlock = nistBlock[0];
    }

    if (!nistBlock) {
      console.error(
        "VRF Facade: NIST evidence missing from proof object",
        proof,
      );
      return false;
    }

    // Send the clean block to the verifier
    return await NistVerifier.verifyPulse(nistBlock);
  }

  /**
   * Run the full NIST SP 800-22 test suite.
   * Best for auditing long-term randomness quality.
   */
  async fullNIST(bits, onProgress) {
    if (typeof bits !== "string" || !/^[01]+$/.test(bits)) {
      throw new Error("NIST tests require a binary bitstring.");
    }
    return await runNistSuite(bits, onProgress);
  }

  /**
   * Basic NIST/Mini test suite (subset).
   * Quick health check for immediate feedback.
   */
  async basicNIST(bits) {
    const allResults = await this.fullNIST(bits);

    // The "Big Four" fundamental tests
    const basicTestNames = [
      "frequencyMonobitTest",
      "blockFrequencyTest",
      "runsTest",
      "longestRunOfOnesTest",
      // Adding common human-readable variations just in case
      "Frequency (Monobit)",
      "Block Frequency",
      "Runs",
      "Longest Run of Ones",
    ];

    const filtered = allResults.filter((r) => {
      // Check if the name matches our list (case-insensitive and trimmed)
      return basicTestNames.some(
        (name) =>
          r.testName?.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(r.testName?.toLowerCase()),
      );
    });

    return filtered;
  }

  /**
   * Inject a custom logger for VRF operations, folding, and extraction.
   * @param {Object} logger - An object with .log and .error methods.
   */
  setLogger(logger) {
    setLoggerProvider(logger);
  }
}
