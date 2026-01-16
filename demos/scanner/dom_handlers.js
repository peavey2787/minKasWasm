// dom_handlers.js
// All handler functions for scanner UI

import * as elements from './dom_elements.js';
import { KaspaBlockScanner, SearchMode, walkDagToPresent, scanDagForward, scanDagBackward } from "../../wrapper/scanner.js";
import { connect } from "../../wrapper/kaspa_client.js";
import { init, createWallet, send } from "../../wrapper/wallet_service.js";
import { IndexerStore, IndexerEventType, EvictionReason } from "../../wrapper/indexer.js";
import * as renderUI from './render_ui.js';

// State (exported for controller)
export let walletInitialized = false;
export let kaspaClient = null;
export let scanner = null;
export let scanning = false;
export let currentIndexerOptions = {};

export async function handleConnectClick() {
  const statusDiv = elements.getStatusDiv();
  const url = elements.getNodeInput().value.trim();
  const networkId = elements.getNetworkInput().value.trim();
  const usePublicResolver = elements.getPublicResolverCheckbox().checked;
  try {
    kaspaClient = usePublicResolver
      ? await connect(null, networkId)
      : await connect(url, networkId);
    statusDiv.textContent = "Connected";

    // Get indexer options from UI
    const ttlInput = elements.getTtlInput();
    const maxSizeInput = elements.getMaxSizeInput();
    const priorityRadios = elements.getIndexerPriorityRadios();
    const matchModeSelect = elements.getMatchModeSelect();
    const indexAllTransactions = elements.getIndexAllTransactionsCheckbox().checked;
    const indexAllMatchingTransactions = elements.getIndexAllMatchingTransactionsCheckbox().checked;
    const indexAllBlocks = elements.getIndexAllBlocksCheckbox().checked;
    const flushIntervalInput = elements.getFlushIntervalInput();
    const flushIntervalSeconds = parseInt(flushIntervalInput?.value) || 5;
    const ttlMinutes = parseInt(ttlInput?.value) || 1;
    const maxSize = parseInt(maxSizeInput?.value) || 500;
    let priorityTTL = true;
    for (const radio of priorityRadios) {
      if (radio.checked && radio.value === "size") priorityTTL = false;
    }
    let matchMode = matchModeSelect.value;
    
    const onIndexerUpdate = (event) => {
      switch (event.type) {
        case IndexerEventType.TRANSACTION_IN_MEMORY:          
          renderUI.renderInMemoryAllTransactionsSection([event.data]);
          break;
        case IndexerEventType.MATCHING_TRANSACTION_IN_MEMORY:
          renderUI.renderInMemoryMatchingTransactionsSection([event.data]);
          break;
        case IndexerEventType.BLOCK_IN_MEMORY:
          renderUI.renderInMemoryBlocksSection([event.data]);
          break;
        case IndexerEventType.TRANSACTION_CACHED:
          renderUI.renderAllTransactionsSection([event.data]);
          break;
        case IndexerEventType.MATCHING_TRANSACTION_CACHED:
          renderUI.renderMatchingTransactionsSection([event.data]);
          break;
        case IndexerEventType.BLOCK_CACHED:
          renderUI.renderAllBlocksSection([event.data]);
          break;        
        case IndexerEventType.EVICT: {
          const { key, storeName, reason } = event.data;
          if (storeName === IndexerStore.MATCHING_TRANSACTIONS) {
            if (reason === EvictionReason.TTL || reason === EvictionReason.SIZE) {
              renderUI.removeMatchingTransactionFromUI(key);
            } else {
              renderUI.removeInMemoryMatchingTransactionFromUI(key);
            }
          } else if (storeName === IndexerStore.TRANSACTIONS) {
            if (reason === EvictionReason.TTL || reason === EvictionReason.SIZE) {
              renderUI.removeTransactionFromUI(key);
            } else {
              renderUI.removeInMemoryTransactionFromUI(key);
            }
          } else if (storeName === IndexerStore.BLOCKS) {
            if (reason === EvictionReason.TTL || reason === EvictionReason.SIZE) {
              renderUI.removeBlockFromUI(key);
            } else {
              renderUI.removeInMemoryBlockFromUI(key);
            }
          }
          break;
        }
        default:
          console.log("Unknown indexer event type:", event.type);
      }
    };
    if (matchMode !== "custom") {
      currentIndexerOptions = {
        ttlMinutes,
        flushIntervalSeconds,
        maxSize,
        priorityTTL,
        matchMode,        
        onIndexerUpdate
      };
    } else {
      currentIndexerOptions = {
        ttlMinutes,
        flushIntervalSeconds,
        maxSize,
        priorityTTL,
        matchMode,
        indexAllTransactions,
        indexAllMatchingTransactions,
        indexAllBlocks,
        onIndexerUpdate
      };
    }
    scanner = new KaspaBlockScanner(kaspaClient, { indexerOptions: currentIndexerOptions });
    await scanner.indexer.initDB();
    renderUI.renderAllIndexerSections(scanner.indexer);
  } catch (err) {
    console.error("Connection error:", err);
    statusDiv.textContent = "Connection failed: " + (err && err.message ? err.message : err);
  }
}

export async function handleStartStopClick() {
  const startStopBtn = elements.getStartStopBtn();
  const statusDiv = elements.getStatusDiv();
  if (!scanner || !kaspaClient) return alert("Connect to a node first!");
  if (!scanning) {
    // Clear previous blocks
    const iframeDoc = elements.getBlocksIframe().contentDocument || elements.getBlocksIframe().contentWindow.document;
    if (iframeDoc && iframeDoc.body) iframeDoc.body.innerHTML = "";
    elements.getMatchesContainer().innerHTML = "";
    // Set search options
    const searchText = elements.getSearchInput().value.trim();
    scanner.prefix = searchText ? searchText : null;
    scanner.addresses = [];
    scanner.searchMode = SearchMode.INCLUDES;

    await scanner.start((block, matches) => {
      // UI: show block in iframe
      renderUI.addBlockToUI(block, null, null);

      // Show matches
      for (const match of matches) {
        renderUI.addBlockToUI(block, match, true);
      }
    });

    scanning = true;
    startStopBtn.textContent = "Stop";
    statusDiv.textContent = "Scanning...";
  } else {
    scanner.stop();
    scanning = false;
    startStopBtn.textContent = "Start";
    statusDiv.textContent = "Stopped.";
    renderUI.stopCountdown();
  }
}

export function handleStartIndexerClick() {
  if (scanner && scanner.indexer && typeof scanner.indexer.start === "function") {
    scanner.indexer.start();
    renderUI.restartCountdown(scanner.indexer.ttlMs);
    renderUI.restartFlushCountdown(scanner.indexer.flushInterval);
  }
}

export function handleStopIndexerClick() {
  renderUI.stopCountdown();
  renderUI.stopFlushCountdown();
  const countdownDiv = elements.getIndexerCountdownDiv();
  countdownDiv.textContent = "";
  scanner.indexer.stop();
}

export function handleMatchModeChange() {
  const matchModeSelect = elements.getMatchModeSelect();
  const customModeOptions = elements.getCustomModeOptions();
  if (matchModeSelect.value === "custom") {
    customModeOptions.style.display = "inline-block";
  } else {
    customModeOptions.style.display = "none";
  }
}

export async function handleClearMatchingTxsClick() {
  if (!scanner || !scanner.indexer) return;
  await scanner.indexer.clearStore(IndexerStore.MATCHING_TRANSACTIONS);
  renderUI.clearAllCachedSections();
}

export async function handleClearAllTxsClick() {
  if (!scanner || !scanner.indexer) return;
  await scanner.indexer.clearStore(IndexerStore.TRANSACTIONS);
  renderUI.clearAllCachedSections();
}

export async function handleClearBlocksClick() {
  if (!scanner || !scanner.indexer) return;
  await scanner.indexer.clearStore(IndexerStore.BLOCKS);
  renderUI.clearAllCachedSections();
}

export function handleCreateWalletClick() {
  const walletLoading = elements.getWalletLoading ? elements.getWalletLoading() : document.getElementById("walletLoading");
  walletLoading.style.display = "inline-block";
  setTimeout(async () => {
    if (!scanner || !kaspaClient) return alert("Connect to a node first!");
    const networkId = elements.getNetworkInput().value.trim();
    if(networkId === "public") {
      await init({rpcClient: kaspaClient, networkId: "mainnet", balanceElementId: "balanceResult" });
    } else {
      await init({rpcClient: kaspaClient, networkId, balanceElementId: "balanceResult" });
    }
    const { address } = await createWallet({ password: "1234" });
    walletInitialized = true;
    elements.getReceiveAddressLabel().textContent = address;
    elements.getToAddressInput().value = address;
    walletLoading.style.display = "none";
  }, 0);
}

export async function handleSendClick() {
  if (!walletInitialized) return alert("Create a wallet first!");
  const toAddress = elements.getToAddressInput().value.trim();
  const amount = elements.getAmountInput().value.trim();
  let payload = elements.getPayloadInput().value.trim();
  try {
    await send({ amount, toAddress, payload });
    elements.getSendResultLabel().textContent = "Transaction sent!";
  } catch (err) {
    elements.getSendResultLabel().textContent = "Send error: " + err.message;
  }
}

export function handleCopyClick() {
  const addr = elements.getReceiveAddressLabel().textContent;
  const copyBtn = elements.getCopyBtn();
  if (addr) {
    navigator.clipboard.writeText(addr).then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => copyBtn.textContent = "Copy", 1000);
    });
  }
}

export function handleToggleInMemoryClick() {
  const btn = elements.getToggleInMemoryBtn();
  const content = elements.getInMemorySections();
  if (content.style.display === "none" || !content.style.display) {
    content.style.display = "block";
    btn.textContent = "In-Memory (Live) Results ▲";
  } else {
    content.style.display = "none";
    btn.textContent = "In-Memory (Live) Results ▼";
  }
}

export function handleToggleCachedClick() {
  const btn = elements.getToggleCachedBtn();
  const content = elements.getCachedSections();
  if (content.style.display === "none" || !content.style.display) {
    content.style.display = "block";
    btn.textContent = "Cached Results (IndexedDB) ▲";
  } else {
    content.style.display = "none";
    btn.textContent = "Cached Results (IndexedDB) ▼";
  }
}

export async function handleDagwalkStartClick() {
  const client = kaspaClient;
  const startHash = elements.getDagwalkBlockHashInput().value.trim();
  const searchText = elements.getDagwalkSearchTextInput().value.trim();
  const maxBlocks = parseInt(elements.getDagwalkMaxBlocksInput().value) || 1000;
  const minTimestamp = parseInt(elements.getDagwalkMinTimestampInput().value) || 0;
  const matchMode = elements.getDagwalkMatchModeSelect().value;
  const modeRadios = elements.getDagwalkModeRadios();
  const resultsDiv = elements.getDagwalkResultsDiv();
  resultsDiv.innerHTML = '';
  // Add loading spinner
  const spinner = document.createElement('span');
  spinner.className = 'loading-spinner';
  spinner.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;"><circle cx="12" cy="12" r="10" stroke="#49eacb" stroke-width="4" stroke-dasharray="60" stroke-dashoffset="40"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></circle></svg> <span style="color:#49eacb;">Walking...</span>`;
  resultsDiv.appendChild(spinner);
  // Validate block hash
  if (!/^[a-fA-F0-9]{64}$/.test(startHash)) {
    resultsDiv.innerHTML = '<span style="color:#e74c3c;">Please enter a valid 64-character hex block hash.</span>';
    return;
  }
  if (!client || !startHash) {
    resultsDiv.innerHTML = '<span style="color:#e74c3c;">Connect and enter a start block hash.</span>';
    return;
  }
  let selectedMode = 'forward-present';
  for (const radio of modeRadios) {
    if (radio.checked) selectedMode = radio.value;
  }
  if (selectedMode === 'forward-present') {
    let count = 0;
    await walkDagToPresent({
      client,
      startHash,
      maxBlocks,
      minTimestamp,
      onBlock: (block) => {
        count++;
        if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
        const div = document.createElement('div');
        div.className = 'block';
        console.log("block:", block);
        div.textContent = `#${count} Hash: ${block?.header?.hash.slice(0,8)}... BlueScore: ${block.header?.blueScore} Txs: ${block.transactions?.length}`;
        resultsDiv.appendChild(div);
      }
    });
    if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
    if (count === 0) resultsDiv.textContent = 'No blocks found.';
  } else if (selectedMode === 'forward-match') {
    // Forward search for match
    let matchModeEnum = 'contains';
    if (matchMode === 'blockHash') matchModeEnum = 'exact';
    else if (matchMode === 'txid') matchModeEnum = 'exact';
    else if (matchMode === 'payload') matchModeEnum = 'contains';
    const result = await scanDagForward({
      client,
      startHash,
      searchText,
      matchMode: matchModeEnum,
      maxBlocks,
      minTimestamp
    });
    if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
    resultsDiv.innerHTML = '';
    if (result) {
      const div = document.createElement('div');
      div.className = 'block match';
      div.textContent = `Found in block ${result.blockHash.slice(0,8)}... TxID: ${result.txId?.slice(0,8)}... Payload: ${result.payload}`;
      resultsDiv.appendChild(div);
    } else {
      resultsDiv.textContent = 'No match found.';
    }
  } else if (selectedMode === 'backward-match') {
    // Backward search for match
    const matchFn = (block, tx) => {
      if (matchMode === 'blockHash') {
        return block.hash === searchText;
      } else if (matchMode === 'txid' && tx) {
        return tx.verboseData?.transactionId === searchText;
      } else if (matchMode === 'payload' && tx) {
        if (!tx.payload) return false;
        try {
          const decoded = tx.payload;
          return decoded.includes(searchText);
        } catch { return false; }
      }
      return false;
    };
    const result = await scanDagBackward({
      client,
      startHash,
      matchFn,
      maxBlocks
    });
    if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
    resultsDiv.innerHTML = '';
    if (result) {
      const div = document.createElement('div');
      div.className = 'block match';
      if (result.tx) {
        div.textContent = `Found in block ${result.block.hash.slice(0,8)}... TxID: ${result.tx.verboseData?.transactionId?.slice(0,8)}...`;
      } else {
        div.textContent = `Found block ${result.block.hash.slice(0,8)}...`;
      }
      resultsDiv.appendChild(div);
    } else {
      resultsDiv.textContent = 'No match found.';
    }
  }
}