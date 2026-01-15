// scanner.js - Generic Kaspa Block Scanner core logic
import { stringToHex, hexToString } from './utilities.js';
import { KaspaIndexer, MatchMode } from './indexer.js';

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
  indexer = null;

  /**
   * Create a KaspaBlockScanner instance.
   * @param {Object} client - The Kaspa RPC client instance.
   * @param {Object} options - Scanner options.
   * @param {string|null} [options.prefix=null] - Plain string prefix to encode and match in payloads.
   * @param {string[]} [options.addresses=[]] - List of addresses to watch.
   * @param {string} [options.mode=SearchMode.INCLUDES] - Search mode: includes, startsWith, exact, endsWith.
   */
  constructor(client, { prefix = null, addresses = [], mode = SearchMode.INCLUDES, indexerOptions = {} } = {}) {
    this.client = client;
    this.blockSubscription = null;
    this.scanning = false;
    this.onBlock = null; // callback(block, matches)
    // Hex encode so we don't have to decode every payload for matching
    this.#prefix = prefix ? stringToHex(prefix) : null; 
    this.addresses = Array.isArray(addresses) ? addresses : [];
    this.searchMode = Object.values(SearchMode).includes(mode) ? mode : SearchMode.INCLUDES;
    this.indexer = new KaspaIndexer(indexerOptions);
    // Ensure onTransaction is set after async initDB
    this.indexer.initDB().then(() => {
      if (typeof indexerOptions.onTransaction === 'function') {
        this.indexer.onTransaction = indexerOptions.onTransaction;
      }
    });
  }

  get prefix() {
    return this.#prefix;
  }

  set prefix(value) {
    this.#prefix = value ? stringToHex(value) : null;
  }


  // --- Modularized scanning logic ---
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
      this._indexBlockIfNeeded(block);
      this._processBlockTransactions(block, matches);
      if (block && typeof onBlock === "function") {
        onBlock(block, matches);
      }
    };
    this.client.addEventListener(BlockScannerEvent.BLOCK_ADDED, this.blockSubscription);
  }

  _processBlockTransactions(block, matches) {
    if (block && Array.isArray(block.transactions)) {
      for (const tx of block.transactions) {
        const { matchObj, isMatch } = this._analyzeTransaction(tx, block);
        if (isMatch) {
          matches.push(matchObj);
          this._indexMatchingTransactionIfNeeded(matchObj);
        }
        this._indexAllTransactionIfNeeded(tx, block);
      }
    }
  }

  _analyzeTransaction(tx, block) {
    const { payloadMatch, decodedPayload } = this._matchPayload(tx);
    const addressMatch = this._matchAddress(tx);
    const isMatch = payloadMatch || addressMatch;
    let matchObj = null;
    if (isMatch) {
      matchObj = this._buildMatchObject(tx, block, payloadMatch, addressMatch, decodedPayload);
    }
    return { matchObj, isMatch };
  }

  _matchPayload(tx) {
    let payloadMatch = false;
    let decodedPayload = null;

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
    let addressMatch = false;
    if (this.addresses.length > 0 && Array.isArray(tx.outputs)) {
      for (const out of tx.outputs) {
        if (out.address && this.addresses.includes(out.address)) {
          addressMatch = true;
          break;
        }
      }
    }
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
    return {
      txid: tx.verboseData.transactionId,
      timestamp: tx.verboseData.blockTime,
      blockHash: block.hash,
      blueScore: block.header.blueScore,
      blockDaaScore: block.header.daaScore,
      timestamp: block.header.timestamp,
      payloadHex: tx.payload,
      decodedPayload,
      payloadMatch,
      addressMatch,
      rawTx: tx
    };
  }

  _indexMatchingTransactionIfNeeded(matchObj) {    
    if (!this.indexer.active) return;
    if (this.indexer.matchMode === MatchMode.ALL ||
        this.indexer.matchMode === MatchMode.MATCHING ||
        (this.indexer.matchMode === MatchMode.CUSTOM && this.indexer.indexAllMatchingTransactions)) {
      this.indexer.addTransaction(matchObj, true);
    }
  }

  _indexAllTransactionIfNeeded(tx, block) {
    if (!this.indexer.active) return;
    if (this.indexer.matchMode === MatchMode.ALL ||
        this.indexer.matchMode === MatchMode.TRANSACTIONS ||
        (this.indexer.matchMode === MatchMode.CUSTOM && this.indexer.indexAllTransactions)) {
      const obj = this._buildMatchObject(tx, block, false, false, null);
      this.indexer.addTransaction(obj, false);
    }
  }

  _indexBlockIfNeeded(block) {
    if (!this.indexer.active) return;
    if (this.indexer.matchMode === MatchMode.ALL ||
        this.indexer.matchMode === MatchMode.BLOCKS ||
        (this.indexer.matchMode === MatchMode.CUSTOM && this.indexer.indexAllBlocks)) {
      this.indexer.addBlock(block);
    }
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

/**
 * Walks the DAG forward using getBlocks(), starting from lowHash,
 * scanning payloads until a match is found.
 *
 * @param {string} startHash - lowHash to begin scanning from
 * @param {string} searchText - user-supplied search string
 * @param {MatchMode} matchMode - EXACT, CONTAINS, PREFIX, CLEANED_CONTAINS
 * @param {number} maxBlocks - safety limit (optional)
 * @param {number} minTimestamp - only scan blocks AFTER this timestamp (ms)
 *
 * @returns {object|null} match result or null if not found
 */
async function scanDagForward({startHash, searchText, matchMode, maxBlocks = 50000, minTimestamp = 0} = {}) {
  let lowHash = startHash;
  let processed = 0;

  const normalize = (hex) => {
    if (!hex) return "";
    const decoded = hexToString(hex);
    return decoded.replace(/[^\x20-\x7E]/g, ""); // strip binary junk
  };

  const matches = (cleaned) => {
    const lower = cleaned.toLowerCase();
    const needle = searchText.toLowerCase();

    switch (matchMode) {
      case MatchMode.EXACT:
        return cleaned === searchText;
      case MatchMode.PREFIX:
        return cleaned.startsWith(searchText);
      case MatchMode.CONTAINS:
        return lower.includes(needle);
      case MatchMode.CLEANED_CONTAINS:
        return lower.includes(needle);
      default:
        return false;
    }
  };

  while (processed < maxBlocks) {
    const resp = await this.client.getBlocks({ lowHash });

    if (!resp || !resp.blocks || resp.blocks.length === 0) {
      return null; // no more blocks
    }

    for (const block of resp.blocks) {
      processed++;

      const blockTime = Number(block.verboseData?.timestamp || 0);

      // ⏱️ Skip blocks older than the cutoff
      if (blockTime < minTimestamp) {
        continue;
      }

      const txs = block.transactions || [];
      for (const tx of txs) {
        const cleaned = normalize(tx.payload);

        if (matches(cleaned)) {
          return {
            txId: tx.verboseData?.transactionId,
            blockHash: block.hash,
            blueScore: block.verboseData?.blueScore,
            payload: cleaned,
            rawPayload: tx.payload,
            timestamp: blockTime,
          };
        }
      }
    }

    // Move forward: next lowHash is the last block in the batch
    lowHash = resp.blocks[resp.blocks.length - 1].hash;
  }

  return null; // not found within maxBlocks
}
