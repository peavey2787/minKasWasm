// connection.js - Connection handling for anti-cheat demo
// Uses the global kaspaPortal singleton exclusively

import { MatchMode, IndexerEventType, SearchMode } from '../../wrapper/kaspaPortal.js';
import { $, getNetworkSelect, getUsePublicResolver, getNodeUrl, getConnectBtn, getWalletAddress, getCopyWalletBtn, getWalletBalance, getWalletStatus } from './dom_elements.js';
import { state, portal } from './state.js';
import { copyToClipboard, setStatus, showInsufficientFundsModal } from './utils.js';
import { autoFetchVRF } from './vrf_sources.js';

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
    // 1. Initialize WASM
    await portal.init();

    // 2. Configure Intelligence (Scanner/Indexer) options
    const indexerOptions = {
      matchMode: MatchMode.CUSTOM,
      indexAllTransactions: false,
      indexAllMatchingTransactions: true,
      indexAllBlocks: true,
      inMemoryMaxTxs: 1000,
      inMemoryMaxBlocks: 1000,
      ttlMinutes: 60
    };

    // 3. Define balance change handler (called by portal when wallet balance changes)
    const handleBalanceChange = (balanceKas) => {
      state.walletBalanceMatureKAS = balanceKas;
      const n = Number(balanceKas);
      state.walletBalanceMatureNumber = Number.isFinite(n) ? n : null;

      setWalletUi({ address: state.walletAddress, balanceKAS: balanceKas, ready: state.walletReady });

      if (state.walletBalanceMatureNumber != null && state.walletBalanceMatureNumber > 0) {
        state.noFundsModalEligibleUntilMs = 0;
      }
      maybeShowNoFundsModalOnce();
    };

    // 4. Connect via Portal singleton with structured options
    await portal.connect({
      rpcUrl: useResolver ? null : nodeUrl,
      networkId,
      startIntelligence: false,
      indexerOptions,
      onBalanceChange: handleBalanceChange
    });

    // 5. Configure scanner + indexer prefixes (keep them in sync)
    const prefix = ($('payloadPrefix')?.value || 'KKTP').trim();
    portal.setSearchMode(SearchMode.STARTS_WITH);
    portal.setPrefixes([prefix]);
    portal.setScannerPrefix(prefix);

    // 6. Wire up event fan-out using portal callbacks
    const fanOut = (type, data) => {
      if (state.indexerUpdateHandlers && state.indexerUpdateHandlers.size) {
        const evt = { type, data };
        for (const handler of state.indexerUpdateHandlers) {
          try { handler(evt); } catch { /* ignore */ }
        }
      }
    };

    portal.onNewTransactionMatch(data => fanOut(IndexerEventType.MATCHING_TRANSACTION_IN_MEMORY, data));
    portal.onCachedTransactionMatch(data => fanOut(IndexerEventType.MATCHING_TRANSACTION_CACHED, data));

    // 7. Start Intelligence
    await portal.intelligence.start();

    // Re-attach the raw block callback for VRF sources (which bypasses the indexer)
    portal.intelligence.scanner.start((block, matches) => {
      // Forward to onBlock if set (for VRF collection)
      if (typeof portal.intelligence.scanner._vrfCallback === 'function') {
        portal.intelligence.scanner._vrfCallback(block, matches);
      }
    });

    console.log('[Connection] Scanner started, waiting for blocks...');

    // 8. Wallet init using portal methods
    // Detect role from page to use unique wallet filenames
    const roleEl = document.querySelector('.role-badge');
    const roleText = roleEl?.textContent?.trim().toLowerCase() || 'default';
    const walletFilename = `anticheat_demo_wallet_${roleText}`;
    const walletHint = `Anti-cheat demo wallet (${roleText})`;

    try {
      const { address } = await portal.createOrOpenWallet({
        password: 'anticheat-demo',
        walletFilename,
        userHint: walletHint,
        storeMnemonic: false,
        discoverAddresses: true,
      });

      state.walletAddress = address;
      state.walletReady = true;

      // Initial balance fetch
      try {
        const balanceSompi = await portal.getBalance();
        const balanceKas = (Number(balanceSompi) / 100000000).toFixed(8).replace(/\.?0+$/, "");
        handleBalanceChange(balanceKas);
      } catch (e) {
        console.warn('[Connection] Initial balance fetch failed:', e);
      }

      console.log('[Connection] Wallet ready:', address);
      setWalletUi({ address, balanceKAS: state.walletBalanceMatureKAS, ready: true });
      maybeShowNoFundsModalOnce();
    } catch (e) {
      state.walletReady = false;
      setWalletUi({ address: '', balanceKAS: null, ready: false });
      console.warn('[Connection] Wallet init/create failed (anchoring disabled):', e);
    }

    state.connected = true;
    setStatus('connectionStatus', 'Connected', 'connected');

    // Auto-fetch VRF after connection
    try {
      await autoFetchVRF();
    } catch (e) {
      console.error("VRF Auto-fetch failed:", e);
    }
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

  // Keep scanner + indexer prefixes in sync with the UI prefix (for matching tx indexing).
  const prefixEl = $('payloadPrefix');
  if (prefixEl) {
    prefixEl.addEventListener('input', () => {
      if (portal.isReady && typeof prefixEl.value === 'string') {
        const prefix = prefixEl.value.trim() || 'KKTP';
        portal.setSearchMode(SearchMode.STARTS_WITH);
        portal.setPrefixes([prefix]);
        portal.setScannerPrefix(prefix);
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
