# Kaspa Transaction & Block Indexer (Browser Version)

## Overview

This module implements a robust, event-driven indexer for Kaspa transactions and blocks in the browser, leveraging both in-memory buffers and IndexedDB for scalable caching. It is designed for high-throughput environments, supporting deduplication, batch flushing, TTL and size-based eviction, and real-time UI updates via event callbacks.

## Coupled With the Block Scanner

This project’s `KaspaBlockScanner` (in `wrapper/scanner.js`) creates and owns a `KaspaIndexer` instance at `scanner.indexer`.

Enable indexing as part of scanning by passing `indexerOptions` into the scanner constructor:

```js
import { KaspaBlockScanner } from './scanner.js';
import { MatchMode } from './indexer.js';

const scanner = new KaspaBlockScanner(client, {
  indexerOptions: {
    ttlMinutes: 10,
    maxSize: 500,
    matchMode: MatchMode.ALL,
    onIndexerUpdate: (event) => {
      // stream updates into your UI
    }
  }
});

scanner.indexer.start();
await scanner.start((block, matches) => {
  // ...
});
```

## Store Routing

- Matching transactions (`isMatch === true`): stored only in `MATCHING_TRANSACTIONS`.
- Non-matching transactions: stored only in `TRANSACTIONS`.
- Blocks: stored in `BLOCKS`.

Matching transactions are **never duplicated** in both stores.

## Features

- **In-Memory & Persistent Caching:**
  - Fast in-memory buffers for transactions and blocks.
  - Persistent storage in IndexedDB for long-term caching.
- **Deduplication:**
  - Prevents duplicate transactions using a rolling cache.
- **Batch Flushing:**
  - Periodically flushes buffered items to IndexedDB based on size or timer.
- **Eviction Logic:**
  - TTL (time-to-live) and size-based eviction for both in-memory and IndexedDB caches.
  - Priority-based eviction (TTL or size first).
- **Event-Driven UI Updates:**
  - Emits events for all cache changes, enabling real-time UI updates.
- **Flexible Indexing Modes:**
  - Supports indexing all transactions, matching transactions, blocks, or custom combinations.
- **Metrics & Observability:**
  - Tracks indexed items, evictions, cache hits/misses, and store clears.

## Usage

### Initialization
```js
import { KaspaIndexer, MatchMode, IndexerEventType, IndexerStore } from './indexer.js';

const indexer = new KaspaIndexer({
  ttlMinutes: 60, // Optional: TTL for cached items
  flushInterval: 5000, // ms, flush buffer every 5 seconds
  maxSize: 5000, // Optional: Max items per store
  batchThresholdRatio: 0.10, // Batch eviction threshold
  priorityTTL: true, // Evict by TTL before size
  inMemoryMaxTxs: 1000, // Max in-memory transactions
  inMemoryMaxBlocks: 1000, // Max in-memory blocks
  dbName: 'kaspaIndexer', // IndexedDB name
  matchMode: MatchMode.ALL, // Indexing mode
  indexAllTransactions: true,
  indexAllMatchingTransactions: true,
  indexAllBlocks: false,
  onIndexerUpdate: (event) => {
    // Handle indexer events for UI updates
    // event.type, event.data
  }
});

await indexer.initDB();
indexer.start();
```

### Indexing Transactions & Blocks
```js
await indexer.addTransaction(txObj, isMatch);
await indexer.addTransactionsBatch([tx1, tx2], isMatch);
await indexer.addBlock(blockObj);
```

### Flushing & Eviction
```js
await indexer.flush(); // Manually flush buffers to IndexedDB
await indexer.evict(); // Manually evict old/oversized items
```

### Querying Data
```js
// NOTE: Matching txs are stored in MATCHING_TRANSACTIONS, non-matching txs in TRANSACTIONS.
// getCachedTransaction(txid) queries the MATCHING_TRANSACTIONS store.
const matchingTx = await indexer.getCachedTransaction(txid);

const allNonMatchingTxs = await indexer.getAllCachedTransactions();
const blocks = await indexer.getAllCachedBlocks();
```

### Clearing Stores
```js
await indexer.clearStore(IndexerStore.TRANSACTIONS);
```

### Metrics
```js
const metrics = indexer.getMetrics();
```

## Event Types
- `transaction-in-memory`: Transaction added to in-memory buffer
- `matching-transaction-in-memory`: Matching transaction added to buffer
- `block-in-memory`: Block added to in-memory buffer
- `transaction-cached`: Batch of transactions emitted after a flush (batched per flush; `event.data` is an array). Note: depending on `matchMode`/flags, this batch may include matching transactions as well.
- `matching-transaction-cached`: Batch of matching transactions emitted after a flush (batched per flush; `event.data` is an array)
- `block-cached`: Blocks flushed to IndexedDB (batched per flush; `event.data` is an array)
- `evict`: Item evicted from an IndexedDB store (`event.data` is `{ key, reason, storeName }`)

## Indexing Modes
- `ALL`: Index all transactions and blocks
- `TRANSACTIONS`: Only index transactions
- `MATCHING`: Only index matching transactions
- `BLOCKS`: Only index blocks
- `CUSTOM`: Custom combination via flags

## Eviction Reasons
- `ttl`: Time-to-live expired
- `size`: Exceeds max size

Note: current eviction events are emitted for IndexedDB TTL/size enforcement.

## Internal Pruning & Eviction
- **In-Memory Pruning:**
  - `_pruneInMemoryBuffer(buffer, max, reason, store, keyField)`
- **IndexedDB Pruning:**
  - `_pruneIndexedDBStore(store, keyField, onEvict)`
  - TTL and size-based, with batch threshold for efficiency

## UI Integration
- Use `onIndexerUpdate` callback to update UI sections in real time.
- Recommended: Render each section in an iframe to prevent auto scrolling interfering with the users scrolling

## Workflow Summary
- **Flush:** Moves items from in-memory buffer to IndexedDB, emits events, and prunes buffers.
- **Evict:** Periodic cleanup of IndexedDB stores by TTL/size, emits events, and updates metrics.

## Contributing
- Keep buffer and cache logic DRY and maintainable.
- Always use event-driven updates for UI consistency.
- Enforce hard caps on all caches.
- Validate all changes with metrics and UI feedback.

---
For questions, issues, or contributions, please open an issue or pull request.
