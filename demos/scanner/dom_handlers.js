// dom_handlers.js
// All handler functions for scanner UI

import * as elements from './dom_elements.js';
import { KaspaBlockScanner, SearchMode } from "../../wrapper/scanner.js";
import { connect } from "../../wrapper/kaspa_client.js";
import { init, createWallet, send } from "../../wrapper/wallet_service.js";
import { MatchMode, IndexerStore } from "../../wrapper/indexer.js";
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
    const ttlMinutes = parseInt(ttlInput?.value) || 1;
    const maxSize = parseInt(maxSizeInput?.value) || 500;
    let priorityTTL = true;
    for (const radio of priorityRadios) {
      if (radio.checked && radio.value === "size") priorityTTL = false;
    }
    let matchMode = matchModeSelect.value;
    const onTransaction = () => renderUI.renderAllIndexerSections(scanner);
    const onEvict = () => renderUI.renderAllIndexerSections(scanner);
    if (matchMode !== "custom") {
      currentIndexerOptions = {
        ttlMinutes,
        maxSize,
        priorityTTL,
        matchMode,
        onEvict,
        onTransaction
      };
    } else {
      currentIndexerOptions = {
        ttlMinutes,
        maxSize,
        priorityTTL,
        matchMode,
        indexAllTransactions,
        indexAllMatchingTransactions,
        indexAllBlocks,
        onEvict,
        onTransaction
      };
    }
    scanner = new KaspaBlockScanner(kaspaClient, { indexerOptions: currentIndexerOptions });
    await scanner.indexer.initDB();
    renderUI.renderAllIndexerSections(scanner);
  } catch (err) {
    console.error("Connection error:", err);
    statusDiv.textContent = "Connection failed: " + (err && err.message ? err.message : err);
  }
}

export function handleEvict(evictedItem, store) {
  console.log("Evicted from store:", store, evictedItem);
}

// Additional handlers
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
  }
}

export function handleStopIndexerClick() {
  renderUI.stopCountdown();
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
  renderUI.renderAllIndexerSections(scanner);
}

export async function handleClearAllTxsClick() {
  if (!scanner || !scanner.indexer) return;
  await scanner.indexer.clearStore(IndexerStore.TRANSACTIONS);
  renderUI.renderAllIndexerSections(scanner);
}

export async function handleClearBlocksClick() {
  if (!scanner || !scanner.indexer) return;
  await scanner.indexer.clearStore(IndexerStore.BLOCKS);
  renderUI.renderAllIndexerSections(scanner);
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