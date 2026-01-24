import {
  fetchBlocks,
  getBitcoinBlocks,
  getKaspaBlocks,
  getQRNG,
} from "./core/fetcher/index.js";
import core from "./core/index.js";

/**
 * Facade for VRF (Verifiable Random Function) operations.
 * Provides access to randomness fetching, folding, and utilities.
 */
export class VrfFacade {
  constructor() {
    // Expose core modules if needed for advanced usage
    this.core = core;
  }

  /**
   * Fetch randomness blocks from various sources.
   * @param {string} source - 'bitcoin', 'kaspa', 'qrng', 'hybrid'
   * @param {number} n - Number of blocks/items
   * @returns {Promise<Object>}
   */
  async fetchBlocks(source, n) {
    return fetchBlocks(source, n);
  }

  /**
   * Fetch Bitcoin blocks.
   * @param {number} n - Number of blocks
   * @returns {Promise<Array>}
   */
  async getBitcoinBlocks(n) {
    return getBitcoinBlocks(n);
  }

  /**
   * Fetch Kaspa blocks (via API).
   * @param {number} n - Number of blocks
   * @returns {Promise<Array>}
   */
  async getKaspaBlocks(n) {
    return getKaspaBlocks(n);
  }

  /**
   * Fetch QRNG data.
   * @param {string} provider - 'nist', 'anu', 'qrandom'
   * @param {number} length - Number of bytes
   * @returns {Promise<Array>}
   */
  async getQRNG(provider, length) {
    return getQRNG(provider, length);
  }

  /**
   * Fold two sources of randomness.
   * @param {string} data1 - Hex string
   * @param {string} data2 - Hex string
   * @param {Object} options - { iterations }
   * @returns {Promise<string>} Folded result
   */
  async fold(data1, data2, options) {
    return core.fold(data1, data2, options);
  }

  /**
   * Run the full NIST SP 800-22 test suite on a bitstring.
   * @param {string} bits - Binary string
   * @returns {Promise<Object[]>} Test results
   */
  async fullNIST(bits) {
    return this.core.fullNIST(bits);
  }

  /**
   * Run a basic subset of NIST tests.
   * @param {string} bits - Binary string
   * @returns {Promise<Object[]>} Test results
   */
  async basicNIST(bits) {
    return this.core.basicNIST(bits);
  }

  /**
   * Generate full randomness using QRNG + Kaspa + BTC.
   * @returns {Promise<string>} Folded result
   */
  async generateFullRandomness() {
    return this.core.GenerateFullRandomness();
  }

  /**
   * Generate partial randomness using Kaspa + BTC.
   * @returns {Promise<string>} Folded result
   */
  async generatePartialRandomness() {
    return this.core.GeneratePartialRandomness();
  }
}
