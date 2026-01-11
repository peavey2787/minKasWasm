// scanner.js - Generic Kaspa Block Scanner core logic
import { hexToString } from './utilities.js';

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
  STARTS_WITH: "startsWith"
});

/**
 * Generic Kaspa Block Scanner for subscribing to new blocks and searching payloads.
 */
export class KaspaBlockScanner {
  /**
   * Create a KaspaBlockScanner instance.
   * @param {Object} client - The Kaspa RPC client instance.
   */
  constructor(client) {
    this.client = client;
    this.blockSubscription = null;
    this.scanning = false;
    this.onBlock = null; // callback(block)
    this.searchString = null;
    this.searchMode = SearchMode.INCLUDES;
  }

  /**
   * Set the search string and mode for payload matching.
   * @param {string} searchString - The string to search for in payloads.
   * @param {string} [mode=SearchMode.INCLUDES] - Search mode: 'includes' or 'startsWith'.
   */
  setSearch(searchString, mode = SearchMode.INCLUDES) {
    this.searchString = searchString ? String(searchString).toLowerCase() : null;
    this.searchMode = Object.values(SearchMode).includes(mode) ? mode : SearchMode.INCLUDES;
  }

  /**
   * Start scanning for new blocks and invoke callback for each block.
   * @param {function} onBlock - Callback function (block, match, matchedPayload).
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
      let match = false;
      let matchedPayload = null;
      if (block && this.searchString && Array.isArray(block.transactions)) {
        for (const tx of block.transactions) {
          if (tx.payload) {
            let decoded = "";
            try {
              decoded = hexToString(tx.payload);
            } catch (e) {
              decoded = "";
            }
            if (
              (this.searchMode === SearchMode.INCLUDES && decoded.includes(this.searchString)) ||
              (this.searchMode === SearchMode.STARTS_WITH && decoded.startsWith(this.searchString))
            ) {
              match = true;
              matchedPayload = decoded;
              break;
            }
          }
        }
      }
      if (block && typeof onBlock === "function") {
        onBlock(block, match, matchedPayload);
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
    this.searchString = null;
  }
}