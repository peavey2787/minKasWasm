// connection.js - Connection handling for anti-cheat demo

import { connect } from '../../wrapper/kaspa_client.js';
import { KaspaBlockScanner } from '../../wrapper/scanner.js';
import { MatchMode } from '../../wrapper/indexer.js';
import { init as walletInit, createWallet } from '../../wrapper/wallet_service.js';
import { $, getNetworkSelect, getUsePublicResolver, getNodeUrl, getConnectBtn } from './dom_elements.js';
import { state } from './state.js';
import { setStatus } from './utils.js';

export async function handleConnect() {
  const networkId = getNetworkSelect().value;
  const useResolver = getUsePublicResolver().checked;
  const nodeUrl = getNodeUrl().value.trim();

  setStatus('connectionStatus', 'Connecting...', 'pending');

  try {
    state.client = useResolver
      ? await connect(null, networkId)
      : await connect(nodeUrl, networkId);

    // Initialize scanner for block indexing
    state.scanner = new KaspaBlockScanner(state.client, {
      // Default prefix for move anchoring; spectator can override at runtime.
      prefix: 'anticheat:move',
      indexerOptions: {
        // Index blocks + matching txs (not all txs) so spectator can replay anchors.
        matchMode: MatchMode.CUSTOM,
        indexAllTransactions: false,
        indexAllMatchingTransactions: true,
        indexAllBlocks: true,

        inMemoryMaxTxs: 1000,
        inMemoryMaxBlocks: 1000,
        ttlMinutes: 60,

        onIndexerUpdate: (evt) => {
          // Fan out to demo listeners (spectator/VRF/etc). No buffering here.
          try {
            if (state.indexerUpdateHandlers && state.indexerUpdateHandlers.size) {
              for (const handler of state.indexerUpdateHandlers) {
                try {
                  handler(evt);
                } catch (e) {
                  // keep scanning even if a handler fails
                }
              }
            }
          } catch (e) {
            // ignore
          }
        },
      }
    });
    await state.scanner.indexer.initDB();

    // Start indexing BEFORE subscribing, so we don't miss the first events.
    state.scanner.indexer.start();

    // Start scanning for blocks - callback will be set by vrf_sources
    state.scanner.start((block, matches) => {
      // Forward to onBlock if set (for VRF collection)
      if (typeof state.scanner._vrfCallback === 'function') {
        state.scanner._vrfCallback(block, matches);
      }
    });
    
    console.log('[Connection] Scanner started, waiting for blocks...');

    // Wallet init (needed for anchoring move payloads)
    try {
      walletInit({
        rpcClient: state.client,
        networkId,
        logger: (...args) => console.log('[Wallet]', ...args),
      });

      const { address } = await createWallet({
        password: 'anticheat-demo',
        filename: 'anticheat_demo_wallet',
        userHint: 'Anti-cheat demo wallet',
        storeMnemonic: false,
        discoverAddresses: true,
      });

      state.walletAddress = address;
      state.walletReady = true;
      console.log('[Connection] Wallet ready:', address);
    } catch (e) {
      state.walletReady = false;
      console.warn('[Connection] Wallet init/create failed (anchoring disabled):', e);
    }

    state.connected = true;
    setStatus('connectionStatus', 'Connected', 'connected');

  } catch (err) {
    console.error('Connection failed:', err);
    setStatus('connectionStatus', 'Failed: ' + err.message, 'disconnected');
  }
}

export function initConnection() {
  getUsePublicResolver().addEventListener('change', (e) => {
    getNodeUrl().disabled = e.target.checked;
  });

  // Keep scanner prefix in sync with the UI prefix (for matching tx indexing).
  const prefixEl = $('payloadPrefix');
  if (prefixEl) {
    prefixEl.addEventListener('input', () => {
      if (state.scanner && typeof prefixEl.value === 'string') {
        state.scanner.prefix = prefixEl.value.trim() || null;
      }
    });
  }

  getConnectBtn().addEventListener('click', handleConnect);
}
