// scanner.js - Generic Kaspa Block Scanner core logic
import { stringToHex, hexToString } from './utilities.js';

/**
 * Enum for block scanner event names.
 * @readonly
 * @enum {string}
 */
export const BlockScannerEvent = Object.freeze({
  BLOCK_ADDED: "block-added"
});

/**
 * Enum for block scanner search modes.
 * @readonly
 * @enum {string}
 */
export const SearchMode = Object.freeze({
  INCLUDES: "includes",
  STARTS_WITH: "startsWith",
  EXACT: "exact",
  ENDS_WITH: "endsWith"
});

/**
 * Generic Kaspa Block Scanner for subscribing to new blocks and searching payloads/addresses.
 */
export class KaspaBlockScanner {
  #prefix = null;
  /**
   * Create a KaspaBlockScanner instance.
   * @param {Object} client - The Kaspa RPC client instance.
   * @param {Object} options - Scanner options.
   * @param {string|null} [options.prefix=null] - Plain string prefix to encode and match in payloads.
   * @param {string[]} [options.addresses=[]] - List of addresses to watch.
   * @param {string} [options.mode=SearchMode.INCLUDES] - Search mode: includes, startsWith, exact, endsWith.
   */
  constructor(client, { prefix = null, addresses = [], mode = SearchMode.INCLUDES } = {}) {
    this.client = client;
    this.blockSubscription = null;
    this.scanning = false;
    this.onBlock = null; // callback(block, matches)
    // Hex encode so we don't have to decode every payload for matching
    this.#prefix = prefix ? stringToHex(prefix) : null; 
    this.addresses = Array.isArray(addresses) ? addresses : [];
    this.searchMode = Object.values(SearchMode).includes(mode) ? mode : SearchMode.INCLUDES;
  }

  get prefix() {
    return this.#prefix;
  }

  set prefix(value) {
    this.#prefix = value ? stringToHex(value) : null;
  }

  /**
   * Start scanning for new blocks and invoke callback for each block.
   * @param {function} onBlock - Callback function (block, matches).
   * @returns {Promise<void>}
   */
  async start(onBlock) {
    if (!this.client) throw new Error("Kaspa client required");
    this.scanning = true;
    this.onBlock = onBlock;
    if (this.blockSubscription) {
      this.client.removeEventListener(BlockScannerEvent.BLOCK_ADDED, this.blockSubscription);
      this.blockSubscription = null;
    }
    await this.client.subscribeBlockAdded();

    this.blockSubscription = (event) => {
      const block = event.data.block;
      const matches = [];

      if (block && Array.isArray(block.transactions)) {
        for (const tx of block.transactions) {
          let payloadMatch = false;
          let addressMatch = false;
          let decodedPayload = null;

          // Check payload against hex-encoded prefix
          if (this.prefix && tx.payload) {
            const payloadHex = tx.payload;
            const prefixHex = this.prefix;

            switch (this.searchMode) {
              case SearchMode.INCLUDES:
                if (payloadHex.includes(prefixHex)) payloadMatch = true;
                break;
              case SearchMode.STARTS_WITH:
                if (payloadHex.startsWith(prefixHex)) payloadMatch = true;
                break;
              case SearchMode.EXACT:
                if (payloadHex === prefixHex) payloadMatch = true;
                break;
              case SearchMode.ENDS_WITH:
                if (payloadHex.endsWith(prefixHex)) payloadMatch = true;
                break;
            }

            // Decode only if matched
            if (payloadMatch) {
              try {
                decodedPayload = hexToString(payloadHex);
              } catch (e) {
                decodedPayload = null;
              }
            }
          }

          // Check addresses
          if (this.addresses.length > 0 && Array.isArray(tx.outputs)) {
            for (const out of tx.outputs) {
              if (out.address && this.addresses.includes(out.address)) {
                addressMatch = true;
                break;
              }
            }
          }

          if (payloadMatch || addressMatch) {
            matches.push({
              txid: tx.id,
              payloadHex: tx.payload,
              decodedPayload,
              payloadMatch,
              addressMatch
            });
          }
        }
      }

      if (block && typeof onBlock === "function") {
        if (!Array.isArray(matches)) matches = [];
        onBlock(block, matches);
      }
    };

    this.client.addEventListener(BlockScannerEvent.BLOCK_ADDED, this.blockSubscription);
  }

  /**
   * Stop scanning for new blocks and remove event listeners.
   */
  stop() {
    this.scanning = false;
    if (this.blockSubscription) {
      this.client.removeEventListener(BlockScannerEvent.BLOCK_ADDED, this.blockSubscription);
      this.blockSubscription = null;
    }
    this.onBlock = null;
    this.prefix = null;
    this.addresses = [];
    this.searchMode = SearchMode.INCLUDES;
  }
}