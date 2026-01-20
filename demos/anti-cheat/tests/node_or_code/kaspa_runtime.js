import { connect } from '../../../../wrapper/kaspa_client.js';
import { KaspaBlockScanner, SearchMode } from '../../../../wrapper/scanner.js';

export async function connectClient({ nodeUrl, networkId }) {
  // wrapper connect: (urlOrNull, networkId)
  return await connect(nodeUrl || null, networkId);
}

export async function startScanner({ client, prefix, onIndexerUpdate, indexerOptions }) {
  const scanner = new KaspaBlockScanner(client, {
    prefix,
    addresses: [],
    mode: SearchMode.INCLUDES,
    indexerOptions: {
      indexAllBlocks: true,
      indexAllTransactions: false,
      indexAllMatchingTransactions: true,
      inMemoryMaxTxs: 10000,
      inMemoryMaxBlocks: 10000,
      flushInterval: 5000,
      ttlMinutes: 60,
      ...(indexerOptions || {}),
    },
  });

  if (scanner.indexer?.initDB) await scanner.indexer.initDB();
  if (scanner.indexer?.start) scanner.indexer.start();

  if (scanner.indexer && typeof onIndexerUpdate === 'function') {
    const prev = scanner.indexer.onIndexerUpdate;
    scanner.indexer.onIndexerUpdate = async (evt) => {
      try { if (typeof prev === 'function') prev(evt); } catch {}
      await onIndexerUpdate(evt);
    };
  }

  // Start streaming blocks; matches are handled via onIndexerUpdate
  await scanner.start(() => {});

  return scanner;
}
