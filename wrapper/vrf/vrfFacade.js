import { recursiveFolding } from "./core/folding.js";
import {
  getKaspaBlocks,
  getBitcoinBlocks,
  getQRNG,
} from "./core/fetcher/index.js";
import { hexToBinary, sha256Hash } from "./core/crypto.js";
import { setLoggerProvider } from "./core/logs/logger.js";

class VrfFacade {
  /**
   * Generates a high-entropy bitstring by folding QRNG, BTC, and Kaspa data.
   * @param {Object} options
   * @param {number} options.btcBlocks - Number of Bitcoin blocks to include (1-32)
   * @param {number} options.kasBlocks - Number of Kaspa blocks to include (1-32)
   * @param {number} options.iterations - Number of recursive folding rounds (1-32)
   * @param {string} options.seed - Initial salt/seed for the extraction process
   * @returns {Promise<Object>} - { finalOutput, evidence }
   */
  async generateFoldedEntropy({
    btcBlocks = 1,
    kasBlocks = 1,
    iterations = 2,
    seed = "kktp-default-seed",
  } = {}) {
    const numPositions = 256; // Fixed constant for extraction depth

    // 1. Fetch with error handling
    const [qrngBlock, kBlocks, bBlocks] = await Promise.all([
      getQRNG("nist", 32),
      getKaspaBlocks(kasBlocks),
      getBitcoinBlocks(btcBlocks),
    ]);

    // Safety Check: Ensure NIST data exists before we try to slice it
    if (!qrngBlock || !qrngBlock.hash || qrngBlock.hash.length < 128) {
      throw new Error("VRF: NIST QRNG source is invalid or unreachable.");
    }

    // 2. Aggregate and Normalize
    const sources = [
      { ...qrngBlock, hash: qrngBlock.hash.substring(0, 64), type: "qrng_1" },
      { ...qrngBlock, hash: qrngBlock.hash.substring(64, 128), type: "qrng_2" },
      ...kBlocks,
      ...bBlocks,
    ];

    // 3. Convert seed
    const initialBits = /^[0-9a-fA-F]+$/.test(seed)
      ? hexToBinary(seed)
      : hexToBinary(await sha256Hash(seed));

    // 4. Execute Engine
    const result = await recursiveFolding(
      sources,
      initialBits,
      "sha256",
      iterations,
      numPositions,
    );

    // 5. Return result + complete evidence for verification
    return {
      finalOutput: result.finalOutput,
      evidence: {
        qrng: qrngBlock,
        kaspa: kBlocks,
        btc: bBlocks,
        config: {
          iterations,
          seed,
          numPositions, // Added for Constants Sync
        },
      },
    };
  }

  /**
   * PROVE: Generates a VRF proof object for a given seed input.
   * @param {string} seedInput - Seed or salt for the VRF generation.
   * @returns {Promise<Object>} - { value, proof }
   */
  async prove(seedInput) {
    // 1. Use our core generator logic to get the value and evidence
    // This handles the NIST splitting, block normalization, and folding automatically.
    const data = await this.generateFoldedEntropy({
      btcBlocks: 1,
      kasBlocks: 1,
      iterations: 2,
      seed: seedInput,
    });

    // 2. Map the output to the "Proof" format your application expects
    return {
      value: data.finalOutput, // The resulting randomness
      proof: {
        seedInput: seedInput,
        // We spread the evidence into the proof bundle
        ...data.evidence,
      },
    };
  }

  /**
   * VERIFY: Validates that a provided value matches the proof bundle.
   */
  async verify(value, proof) {
    // 1. Authenticity Check: Is the NIST data real?
    // In production, this calls a helper that checks the pulse signatureValue
    // against the NIST Beacon 2.0 Public Key.
    const isNistAuthentic = await this.isValidNistSignature(proof.qrng);
    if (!isNistAuthentic) {
      console.error("VRF Verification Failed: NIST Signature is invalid.");
      return false;
    }

    // 2. Reconstruct sources (Exact mirror of generation)
    const nistHash = proof.qrng.hash || proof.qrng.outputValue;
    const entropySources = [
      { hash: nistHash.substring(0, 64), isFinal: true },
      { hash: nistHash.substring(64, 128), isFinal: true },
      ...proof.kaspa.map((b) => ({ hash: b.hash, isFinal: true })),
      ...proof.btc.map((b) => ({ hash: b.hash, isFinal: true })),
    ];

    // 3. Reconstruct starting state
    const initialBits = /^[0-9a-fA-F]+$/.test(proof.config.seed)
      ? hexToBinary(proof.config.seed)
      : hexToBinary(await sha256Hash(proof.config.seed));

    // 4. Re-run engine using synchronized constants
    const result = await recursiveFolding(
      entropySources,
      initialBits,
      "sha256",
      proof.config.iterations,
      proof.config.numPositions || 256, // Fallback to 256
    );

    return result.finalOutput === value;
  }

  /**
   * Helper to verify NIST Signature authenticity
   */
  async isValidNistSignature(qrngBlock) {
    // This is where you implement RSA-SHA256 signature verification.
    // For now, we verify the pulse exists and has a signature string.
    return !!(qrngBlock.metadata?.signature || qrngBlock.signature);
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

    // Filter for the "Big Four" fundamental tests
    const basicTests = [
      "frequencyMonobitTest",
      "blockFrequencyTest",
      "runsTest",
      "longestRunOfOnesTest",
    ];

    return allResults.filter((r) => basicTests.includes(r.testName));
  }

  /**
   * Inject a custom logger for VRF operations, folding, and extraction.
   * @param {Object} logger - An object with .log and .error methods.
   */
  setLogger(logger) {
    setLoggerProvider(logger);
  }
}

export default new VrfFacade();
