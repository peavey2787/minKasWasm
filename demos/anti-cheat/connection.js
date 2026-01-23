// connection.js - Connection handling for anti-cheat demo

import { MatchMode, IndexerEventType } from '../../wrapper/kaspaPortal.js';
import { $, getNetworkSelect, getUsePublicResolver, getNodeUrl, getConnectBtn, getWalletAddress, getCopyWalletBtn, getWalletBalance, getWalletStatus } from './dom_elements.js';
import { state } from './state.js';
import { copyToClipboard, setStatus, showInsufficientFundsModal } from './utils.js';

function maybeShowNoFundsModalOnce() {
  if (state.noFundsModalShown) return;
  const now = Date.now();
  if (!state.noFundsModalEligibleUntilMs || now > state.noFundsModalEligibleUntilMs) return;
  if (!state.walletReady || !state.walletAddress) return;

  const n = state.walletBalanceMatureNumber;
  // Only show if mature balance is exactly 0 (or effectively 0).
  if (typeof n === 'number' && Number.isFinite(n) && n <= 0) {
    state.noFundsModalShown = true;
    showInsufficientFundsModal({
      requiredKAS: 0.2,
      balanceKAS: state.walletBalanceMatureKAS,
      address: state.walletAddress,
    });
  }
}

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

  // Allow showing the modal only during the initial connect window.
  state.noFundsModalShown = false;
  state.noFundsModalEligibleUntilMs = Date.now() + 30_000;

  setStatus('connectionStatus', 'Connecting...', 'pending');

  try {
    // 1. Configure Intelligence (Scanner/Indexer) options
    const indexerOptions = {
      matchMode: MatchMode.CUSTOM,
      indexAllTransactions: false,
      indexAllMatchingTransactions: true,
      indexAllBlocks: true,
      inMemoryMaxTxs: 1000,
      inMemoryMaxBlocks: 1000,
      ttlMinutes: 60
    };

    // 2. Connect via Portal
    // We pass startIntelligence: false so we can manually configure the scanner prefix/callback before starting
    await state.portal.connect(useResolver ? null : nodeUrl, networkId, {
      startIntelligence: false
    });

    // Map portal components to state for compatibility with other modules
    state.client = state.portal.client;
    state.scanner = state.portal.intelligence.scanner;

    // 3. Configure Scanner
    state.scanner.prefix = 'KKTP';
    // Apply indexer options manually since we created portal before knowing them
    Object.assign(state.scanner.indexer, indexerOptions);
    
    // Wire up event fan-out
    const fanOut = (type, data) => {
      if (state.indexerUpdateHandlers && state.indexerUpdateHandlers.size) {
        const evt = { type, data };
        for (const handler of state.indexerUpdateHandlers) {
          try { handler(evt); } catch { /* ignore */ }
        }
      }
    };

    state.portal.onNewTransactionMatch(data => fanOut(IndexerEventType.MATCHING_TRANSACTION_IN_MEMORY, data));
    state.portal.onCachedTransactionMatch(data => fanOut(IndexerEventType.MATCHING_TRANSACTION_CACHED, data));

    // 4. Start Intelligence
    await state.portal.intelligence.start();
    
    // Re-attach the raw block callback for VRF sources (which bypasses the indexer)
    state.scanner.start((block, matches) => {
      // Forward to onBlock if set (for VRF collection)
      if (typeof state.scanner._vrfCallback === 'function') {
        state.scanner._vrfCallback(block, matches);
      }
    });
    
    console.log('[Connection] Scanner started, waiting for blocks...');

    // Wallet init (needed for anchoring move payloads)
    try {
      // Define balance updater to sync UI with wallet state
      const updateBalance = async () => {
        try {
          const balanceSompi = await state.portal.getBalance();
          const balanceKas = (Number(balanceSompi) / 100000000).toFixed(8).replace(/\.?0+$/, "");
          
          state.walletBalanceMatureKAS = balanceKas;
          const n = Number(balanceKas);
          state.walletBalanceMatureNumber = Number.isFinite(n) ? n : null;
          
          setWalletUi({ address: state.walletAddress, balanceKAS: balanceKas, ready: state.walletReady });

          if (state.walletBalanceMatureNumber != null && state.walletBalanceMatureNumber > 0) {
            state.noFundsModalEligibleUntilMs = 0;
          }
          maybeShowNoFundsModalOnce();
        } catch (e) {
          console.error("Balance update failed", e);
        }
      };

      // Attach listener to the WASM wallet instance exposed by portal
      if (state.portal.wallet) {
        state.portal.wallet.addEventListener("balance", () => updateBalance());
      }

      const { address } = await state.portal.identity.createWallet({
        password: 'anticheat-demo',
        filename: 'anticheat_demo_wallet',
        userHint: 'Anti-cheat demo wallet',
        storeMnemonic: false,
        discoverAddresses: true,
      });

      state.walletAddress = address;
      state.walletReady = true;
      
      // Initial balance fetch
      await updateBalance();
      
      console.log('[Connection] Wallet ready:', address);
      maybeShowNoFundsModalOnce();
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
  const connectBtn = getConnectBtn();
  if (!connectBtn) return; // Guard: No connection UI present

  const resolverChk = getUsePublicResolver();
  if (resolverChk) {
    resolverChk.addEventListener('change', (e) => {
      const urlInput = getNodeUrl();
      if (urlInput) urlInput.disabled = e.target.checked;
    });
  }

  // Keep scanner prefix in sync with the UI prefix (for matching tx indexing).
  const prefixEl = $('payloadPrefix');
  if (prefixEl) {
    prefixEl.addEventListener('input', () => {
      if (state.scanner && typeof prefixEl.value === 'string') {
        state.scanner.prefix = prefixEl.value.trim() || 'KKTP';
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

  connectBtn.addEventListener('click', handleConnect);
}
