// connection.js - Connection handling for anti-cheat demo

import { connect } from '../../wrapper/kaspa_client.js';
import { KaspaBlockScanner } from '../../wrapper/scanner.js';
import { MatchMode } from '../../wrapper/indexer.js';
import { init as walletInit, createWallet } from '../../wrapper/wallet_service.js';
import { $, getNetworkSelect, getUsePublicResolver, getNodeUrl, getConnectBtn, getWalletAddress, getCopyWalletBtn, getWalletBalance, getWalletStatus } from './dom_elements.js';
import { state } from './state.js';
import { copyToClipboard, setStatus } from './utils.js';

function setWalletUi({ address = '', balanceKAS = null, ready = false } = {}) {
  const addrEl = getWalletAddress();
  const copyBtn = getCopyWalletBtn();
  const balEl = getWalletBalance();
  const statusEl = getWalletStatus();

  if (addrEl) addrEl.value = address || '';
  if (copyBtn) copyBtn.disabled = !address;
  if (balEl) {
    balEl.textContent = balanceKAS == null ? '--' : `${balanceKAS} KAS`;
    balEl.className = `status-badge ${ready ? 'connected' : 'pending'}`;
  }
  if (statusEl) {
    statusEl.textContent = ready ? 'Ready' : 'Not Ready';
    statusEl.className = `status-badge ${ready ? 'connected' : 'pending'}`;
  }
}

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
        onBalanceChange: (matureBalance) => {
          state.walletBalanceMatureKAS = matureBalance;
          const n = Number(matureBalance);
          state.walletBalanceMatureNumber = Number.isFinite(n) ? n : null;
          setWalletUi({ address: state.walletAddress, balanceKAS: matureBalance, ready: state.walletReady });
        }
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
      setWalletUi({ address: state.walletAddress, balanceKAS: state.walletBalanceMatureKAS, ready: true });
      console.log('[Connection] Wallet ready:', address);
    } catch (e) {
      state.walletReady = false;
      setWalletUi({ address: '', balanceKAS: null, ready: false });
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

  // Wallet copy button
  const copyBtn = getCopyWalletBtn();
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const addr = state.walletAddress || getWalletAddress()?.value || '';
      const ok = await copyToClipboard(addr);
      copyBtn.textContent = ok ? 'Copied' : 'Copy Failed';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
    });
  }

  // Initialize wallet UI defaults
  setWalletUi({ address: '', balanceKAS: null, ready: false });

  getConnectBtn().addEventListener('click', handleConnect);
}
