// scanner.js - Generic Kaspa Block Scanner core logic
import {
  stringToHex,
  hexToString,
  dehydrateTx,
  dehydrateBlock,
} from "../utilities/utilities.js";
import { KaspaIndexer, MatchMode } from "./indexer.js";

/**
 * Enum for block scanner event names.
 * @readonly
 * @enum {string}
 */
export const BlockScannerEvent = Object.freeze({
  BLOCK_ADDED: "block-added",
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
  ENDS_WITH: "endsWith",
});

/**
 * Generic Kaspa Block Scanner for subscribing to new blocks and searching payloads/addresses.
 */
export class KaspaBlockScanner {
  #prefixes = new Set();
  #blockSubscribers = new Set();
  #matchSubscribers = new Set();
  #blockListener = null;
  #reconnectHandler = null;
  #lastBlockTime = null;
  #pendingBlockEnrichment = new Set();
  indexer = null;

  /**
   * Create a KaspaBlockScanner instance.
   * @param {Object} client - The Kaspa RPC client instance.
   * @param {Object} options - Scanner options.
   * @param {string|null} [options.prefixes=[]] - Array of plain string prefixes to encode and match in payloads.
   * @param {string[]} [options.addresses=[]] - List of addresses to watch.
   * @param {string} [options.mode=SearchMode.INCLUDES] - Search mode: includes, startsWith, exact, endsWith.
   */
  constructor(
    client,
    {
      prefixes = [],
      addresses = [],
      mode = SearchMode.INCLUDES,
      indexerOptions = {},
      onMatch = null,
      onBlock = null,
    } = {},
  ) {
    this.client = client;
    this.scanning = false;

    if (typeof onBlock === "function") {
      this.#blockSubscribers.add(onBlock);
    }
    if (typeof onMatch === "function") {
      this.#matchSubscribers.add(onMatch);
    }

    // Initialize with provided prefixes
    if (Array.isArray(prefixes)) {
      prefixes.forEach((p) => this.addPrefix(p));
    } else if (prefixes) {
      this.addPrefix(prefixes);
    }

    this.addresses = Array.isArray(addresses) ? addresses : [];
    this.searchMode = Object.values(SearchMode).includes(mode)
      ? mode
      : SearchMode.INCLUDES;
    this.indexer = new KaspaIndexer(indexerOptions);
    // Ensure onIndexerUpdate is set after async initDB
    this.indexer.initDB().then(() => {
      if (typeof indexerOptions.onIndexerUpdate === "function") {
        this.indexer.onIndexerUpdate = indexerOptions.onIndexerUpdate;
      }
    });
  }

  get prefixes() {
    return Array.from(this.#prefixes);
  }

  /** Sets the entire list of prefixes, replacing existing ones. */
  set prefixes(values) {
    this.#prefixes.clear();
    const arr = Array.isArray(values) ? values : [values];
    arr.forEach((v) => this.addPrefix(v));
  }

  /** Adds a prefix to the watch list. */
  addPrefix(prefix) {
    if (!prefix) return;
    this.#prefixes.add(stringToHex(prefix));
  }

  /** Removes a prefix from the watch list. */
  removePrefix(prefix) {
    this.#prefixes.delete(stringToHex(prefix));
  }

  /** Adds an address to the watch list if not already present. */
  addAddress(address) {
    if (!this.addresses.includes(address)) {
      this.addresses.push(address);
    }
  }

  /** Removes an address from the watch list. */
  removeAddress(address) {
    this.addresses = this.addresses.filter((a) => a !== address);
  }

  subscribeBlock(fn) {
    if (typeof fn !== "function") return () => {};
    this.#blockSubscribers.add(fn);
    return () => this.#blockSubscribers.delete(fn);
  }

  subscribeMatch(fn) {
    if (typeof fn !== "function") return () => {};
    this.#matchSubscribers.add(fn);
    return () => this.#matchSubscribers.delete(fn);
  }

  checkHealth() {
    if (!this.scanning) return true;
    if (!this.#lastBlockTime) return false;
    return Date.now() - this.#lastBlockTime <= 60_000;
  }

  get status() {
    return {
      scanning: this.scanning,
      matchSubscribers: this.#matchSubscribers.size,
      blockSubscribers: this.#blockSubscribers.size,
      prefixes: this.#prefixes.size,
      lastBlockTime: this.#lastBlockTime,
      health: this.checkHealth(),
    };
  }

  // --- Modularized scanning logic ---
  async start(onBlock) {
    if (!this.client) throw new Error("Kaspa client required");
    if (this.scanning) return;
    this.scanning = true;
    this.#lastBlockTime = Date.now();
    if (onBlock && typeof onBlock === "function") {
      this.#blockSubscribers.add(onBlock);
    }
    if (this.#blockListener) {
      this.client.removeEventListener(
        BlockScannerEvent.BLOCK_ADDED,
        this.#blockListener,
      );
      this.#blockListener = null;
    }
    await this.client.subscribeBlockAdded();

    if (!this.#reconnectHandler) {
      this.#reconnectHandler = () => {
        if (this.scanning) {
          this.client.subscribeBlockAdded();
        }
      };
      this.client.addEventListener("connect", this.#reconnectHandler);
    }

    const listener = (event) => {
      const block = event.data.block;
      const matches = [];

      this.#lastBlockTime = Date.now();

      const txCount = this._processBlockTransactions(block, matches);

      // Index blocks (but never store the full block w/ tx array).
      this._indexBlockIfNeeded(block, txCount);

      if (block) {
        for (const subscriber of this.#blockSubscribers) {
          try {
            subscriber(block, matches);
          } catch (err) {
            console.error("Block subscriber error", err);
          }
        }
      }
    };

    this.#blockListener = listener;

    this.client.addEventListener(
      BlockScannerEvent.BLOCK_ADDED,
      this.#blockListener,
    );
  }

  _processBlockTransactions(block, matches) {
    const txs = block?.transactions;
    if (!txs) return null;

    const hasPrefix = this.#prefixes.size > 0;
    const hasAddresses =
      Array.isArray(this.addresses) && this.addresses.length > 0;
    const shouldMatch = hasPrefix || hasAddresses;
    const indexerActive = !!this.indexer?.active;

    let txCount = 0;

    const isIterable = typeof txs?.[Symbol.iterator] === "function";
    if (isIterable) {
      for (const tx of txs) {
        txCount++;
        try {
          // Matching is only meaningful if we have prefixes and/or addresses.
          if (shouldMatch) {
            const { matchObj, isMatch } = this._analyzeTransaction(tx, block);
            if (isMatch) {
              matches.push(matchObj);
              this._indexMatchingTransactionIfNeeded(matchObj);
              for (const subscriber of this.#matchSubscribers) {
                try {
                  subscriber(block, matchObj);
                } catch (err) {
                  console.error("Match subscriber error", err);
                }
              }
            }
          }

          // Indexing "all transactions" is independent of matching.
          if (indexerActive) {
            this._indexAllTransactionIfNeeded(tx, block);
          }
        } finally {
          if (tx && typeof tx.free === "function") {
            tx.free(); // free WASM tx object
          }
        }
      }
      return txCount;
    }

    // Fallback for array-like but non-iterable
    if (typeof txs.length === "number") {
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        txCount++;
        try {
          // Matching is only meaningful if we have prefixes and/or addresses.
          if (shouldMatch) {
            const { matchObj, isMatch } = this._analyzeTransaction(tx, block);
            if (isMatch) {
              matches.push(matchObj);
              this._indexMatchingTransactionIfNeeded(matchObj);
              for (const subscriber of this.#matchSubscribers) {
                try {
                  subscriber(block, matchObj);
                } catch (err) {
                  console.error("Match subscriber error", err);
                }
              }
            }
          }

          // Indexing "all transactions" is independent of matching.
          if (indexerActive) {
            this._indexAllTransactionIfNeeded(tx, block);
          }
        } finally {
          if (tx && typeof tx.free === "function") {
            tx.free(); // free WASM tx object
          }
        }
      }
      return txCount;
    }

    return null;
  }

  _analyzeTransaction(tx, block) {
    const { payloadMatch, decodedPayload } = this._matchPayload(tx);
    const addressMatch = this._matchAddress(tx);
    const isMatch = payloadMatch || addressMatch;
    let matchObj = null;
    if (isMatch) {
      matchObj = this._buildMatchObject(
        tx,
        block,
        payloadMatch,
        addressMatch,
        decodedPayload,
      );
    }
    return { matchObj, isMatch };
  }

  _matchPayload(tx) {
    let payloadMatch = false;
    let decodedPayload = null;

    if (this.#prefixes.size > 0 && tx.payload) {
      const payloadHex = tx.payload;

      for (const prefixHex of this.#prefixes) {
        switch (this.searchMode) {
          case SearchMode.INCLUDES:
            payloadMatch = payloadHex.includes(prefixHex);
            break;
          case SearchMode.STARTS_WITH:
            payloadMatch = payloadHex.startsWith(prefixHex);
            break;
          case SearchMode.EXACT:
            payloadMatch = payloadHex === prefixHex;
            break;
          case SearchMode.ENDS_WITH:
            payloadMatch = payloadHex.endsWith(prefixHex);
            break;
          default:
            payloadMatch = false;
        }
        if (payloadMatch) break;
      }

      if (payloadMatch) {
        try {
          decodedPayload = hexToString(payloadHex);
        } catch (e) {
          decodedPayload = null;
        }
      }
    }
    return { payloadMatch, decodedPayload };
  }

  _matchAddress(tx) {
    // If we're not watching addresses, do nothing.
    if (!Array.isArray(this.addresses) || this.addresses.length === 0)
      return false;

    let addressMatch = false;
    if (Array.isArray(tx.outputs)) {
      for (const out of tx.outputs) {
        const addr = out.verboseData?.scriptPublicKeyAddress;
        if (addr && this.addresses.includes(addr)) {
          addressMatch = true;
          break;
        }
      }
    }

    /* Currently I have no idea how to get the from address since:
       -the verboseData in input is always undefined
       -and the previousOutpoint is just index an txid
       -and there is no "get transaction by id" kind of
       method in the WASM SDK
    */
    if (!addressMatch && Array.isArray(tx.inputs)) {
      for (const input of tx.inputs) {
        const senderAddress = input.previousOutpointAddress;
        if (senderAddress && this.addresses.includes(senderAddress)) {
          addressMatch = true;
          break;
        }
      }
    }

    return addressMatch;
  }

  _buildMatchObject(tx, block, payloadMatch, addressMatch, decodedPayload) {
    const dehydratedTx = dehydrateTx({ tx, block, decodedPayload });
    dehydratedTx.payloadMatch = payloadMatch;
    dehydratedTx.addressMatch = addressMatch;
    return dehydratedTx;
  }

  _indexMatchingTransactionIfNeeded(matchObj) {
    if (!this.indexer.active) return;
    if (
      this.indexer.matchMode === MatchMode.ALL ||
      this.indexer.matchMode === MatchMode.MATCHING ||
      (this.indexer.matchMode === MatchMode.CUSTOM &&
        this.indexer.indexAllMatchingTransactions)
    ) {
      this.indexer.addTransaction(matchObj, true);
    }
  }

  _indexAllTransactionIfNeeded(tx, block) {
    if (!this.indexer.active) return;
    if (
      this.indexer.matchMode === MatchMode.ALL ||
      this.indexer.matchMode === MatchMode.TRANSACTIONS ||
      (this.indexer.matchMode === MatchMode.CUSTOM &&
        this.indexer.indexAllTransactions)
    ) {
      const obj = this._buildMatchObject(tx, block, false, false, null);
      this.indexer.addTransaction(obj, false);
    }
  }

  _indexBlockIfNeeded(block, txCountOverride = null) {
    if (!this.indexer.active) return;
    if (
      this.indexer.matchMode === MatchMode.ALL ||
      this.indexer.matchMode === MatchMode.BLOCKS ||
      (this.indexer.matchMode === MatchMode.CUSTOM &&
        this.indexer.indexAllBlocks)
    ) {
      const summary = dehydrateBlock(block);
      if (summary) {
        const headerCountRaw =
          block?.header?.transactionCount ??
          block?.header?.txCount ??
          block?.transactionCount ??
          block?.txCount ??
          null;

        const headerCount = Number(headerCountRaw);
        const hasHeaderCount = Number.isFinite(headerCount);

        if (Number.isFinite(txCountOverride)) {
          summary.txCount = txCountOverride;
        } else if (hasHeaderCount) {
          summary.txCount = headerCount;
        }
      }
      this.indexer.addBlock(summary);

      const needsEnrichment =
        summary?.hash &&
        (!Number.isFinite(summary?.txCount) || summary?.txCount <= 0);
      if (needsEnrichment) {
        this._enrichBlockTxCount(summary.hash);
      }
    }
  }

  async _enrichBlockTxCount(hash) {
    if (!hash || this.#pendingBlockEnrichment.has(hash)) return;
    this.#pendingBlockEnrichment.add(hash);

    try {
      const full = await this._fetchBlockWithTransactions(hash);
      const txs = full?.transactions;
      const txCount = Array.isArray(txs) && txs.length > 0 ? txs.length : null;

      if (txCount != null) {
        const summary = dehydrateBlock(full);
        if (summary) summary.txCount = txCount;
        this.indexer.addBlock(summary);
      }
    } catch (err) {
      console.error("Block enrichment failed:", err);
    } finally {
      this.#pendingBlockEnrichment.delete(hash);
    }
  }

  async _fetchBlockWithTransactions(hash) {
    const c = this.client;

    if (c && typeof c.getBlock === "function") {
      try {
        return await c.getBlock({ hash, includeTransactions: true });
      } catch {}
    }
    if (c && typeof c.getBlockByHash === "function") {
      try {
        return await c.getBlockByHash(hash);
      } catch {}
    }
    if (c && typeof c.getBlockWithTransactions === "function") {
      try {
        return await c.getBlockWithTransactions(hash);
      } catch {}
    }

    return null;
  }

  /**
   * Stop scanning for new blocks and remove event listeners.
   */
  stop() {
    this.scanning = false;
    if (this.#blockListener) {
      this.client.removeEventListener(
        BlockScannerEvent.BLOCK_ADDED,
        this.#blockListener,
      );
      this.#blockListener = null;
    }
    if (this.#reconnectHandler) {
      this.client.removeEventListener("connect", this.#reconnectHandler);
      this.#reconnectHandler = null;
    }
    const isConnected =
      (typeof this.client?.isConnected === "function" &&
        this.client.isConnected()) ||
      this.client?.connected === true;
    if (
      isConnected &&
      typeof this.client?.unsubscribeBlockAdded === "function"
    ) {
      this.client.unsubscribeBlockAdded();
    }
    this.#blockSubscribers.clear();
    this.#matchSubscribers.clear();
    this.#prefixes = new Set();
    this.addresses = [];
    this.searchMode = SearchMode.INCLUDES;
  }
}
