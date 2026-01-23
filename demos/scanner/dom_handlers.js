// dom_handlers.js
// All handler functions for scanner UI

import * as elements from './dom_elements.js';
import { KaspaPortal, SearchMode, IndexerStore } from "../../wrapper/kaspaPortal.js";
import * as renderUI from './render_ui.js';

// State (exported for controller)
export let walletInitialized = false;
export let portal = null;
export let scanning = false;
export let currentIndexerOptions = {};

let inMemoryRenderTimer = null;
const IN_MEMORY_RENDER_THROTTLE_MS = 250;

let cachedRenderTimer = null;
const CACHED_RENDER_THROTTLE_MS = 350;

function renderInMemoryLiveSnapshot() {
  if (!portal || !portal.intelligence || !portal.intelligence.indexer) return;
  renderUI.renderInMemoryAllTransactionsSection(portal.intelligence.indexer.getAllTransactions());
  renderUI.renderInMemoryMatchingTransactionsSection(portal.intelligence.indexer.getAllMatchingTransactions());
  renderUI.renderInMemoryBlocksSection(portal.intelligence.indexer.getAllBlocks());
}

function isInMemoryPanelOpen() {
  const content = elements.getInMemorySections();
  return !!content && content.style.display !== "none" && content.style.display !== "";
}

function isCachedPanelOpen() {
  const content = elements.getCachedSections();
  return !!content && content.style.display !== "none" && content.style.display !== "";
}

function scheduleInMemoryLiveSnapshot() {
  // Don’t do heavy DOM work when the user can’t see it.
  if (!isInMemoryPanelOpen()) return;

  if (inMemoryRenderTimer) return;
  inMemoryRenderTimer = setTimeout(() => {
    inMemoryRenderTimer = null;
    renderInMemoryLiveSnapshot();
  }, IN_MEMORY_RENDER_THROTTLE_MS);
}

function scheduleCachedSnapshotRender() {
  // Don’t do IndexedDB reads + DOM work when the user can’t see it.
  if (!isCachedPanelOpen()) return;
  if (!portal || !portal.intelligence || !portal.intelligence.indexer) return;

  if (cachedRenderTimer) return;
  cachedRenderTimer = setTimeout(async () => {
    cachedRenderTimer = null;
    await renderUI.renderAllIndexerSections(portal.intelligence.indexer);
  }, CACHED_RENDER_THROTTLE_MS);
}

export async function handleConnectClick() {
  const statusDiv = elements.getStatusDiv();
  const url = elements.getNodeInput().value.trim();
  const networkId = elements.getNetworkInput().value.trim();
  const usePublicResolver = elements.getPublicResolverCheckbox().checked;
  try {

    // Get indexer options from UI
    const ttlInput = elements.getTtlInput();
    const maxSizeInput = elements.getMaxSizeInput();
    const inMemoryMaxInput = elements.getInMemoryMaxInput();
    const priorityRadios = elements.getIndexerPriorityRadios();
    const matchModeSelect = elements.getMatchModeSelect();
    const indexAllTransactions = elements.getIndexAllTransactionsCheckbox().checked;
    const indexAllMatchingTransactions = elements.getIndexAllMatchingTransactionsCheckbox().checked;
    const indexAllBlocks = elements.getIndexAllBlocksCheckbox().checked;
    const flushIntervalInput = elements.getFlushIntervalInput();
    const flushIntervalSeconds = parseInt(flushIntervalInput?.value) || 5;
    const flushInterval = flushIntervalSeconds * 1000;
    const ttlMinutes = parseInt(ttlInput?.value) || 1;
    const maxSize = parseInt(maxSizeInput?.value) || 500;
    const inMemoryMax = parseInt(inMemoryMaxInput?.value) || 500;
    let priorityTTL = true;
    for (const radio of priorityRadios) {
      if (radio.checked && radio.value === "size") priorityTTL = false;
    }
    let matchMode = matchModeSelect.value;
    
    if (matchMode !== "custom") {
      currentIndexerOptions = {
        ttlMinutes,
        flushInterval,
        maxSize,
        priorityTTL,
        matchMode,        
        inMemoryMaxTxs: inMemoryMax,
        inMemoryMaxBlocks: inMemoryMax
      };
    } else {
      currentIndexerOptions = {
        ttlMinutes,
        flushInterval,
        maxSize,
        priorityTTL,
        matchMode,
        indexAllTransactions,
        indexAllMatchingTransactions,
        indexAllBlocks,
        inMemoryMaxTxs: inMemoryMax,
        inMemoryMaxBlocks: inMemoryMax
      };
    }
    
    portal = new KaspaPortal({
      intelligence: {
        indexer: currentIndexerOptions
      }
    });
    
    portal
      .onNewTransaction(() => scheduleInMemoryLiveSnapshot())
      .onNewTransactionMatch(() => scheduleInMemoryLiveSnapshot())
      .onNewBlock(() => scheduleInMemoryLiveSnapshot())
      .onCachedTransaction(() => scheduleCachedSnapshotRender())
      .onCachedTransactionMatch(() => scheduleCachedSnapshotRender())
      .onCachedBlock(() => scheduleCachedSnapshotRender())
      .onEvict(() => scheduleInMemoryLiveSnapshot())
      .onCacheEvict(() => scheduleCachedSnapshotRender());

    await portal.connect(usePublicResolver ? null : url, networkId, { startIntelligence: false, balanceElementId: "balanceResult" });
    statusDiv.textContent = "Connected";

    await portal.intelligence.indexer.initDB();
    renderUI.renderAllIndexerSections(portal.intelligence.indexer);
    scheduleInMemoryLiveSnapshot();
  } catch (err) {
    console.error("Connection error:", err);
    statusDiv.textContent = "Connection failed: " + (err && err.message ? err.message : err);
  }
}

export async function handleStartStopClick() {
  const startStopBtn = elements.getStartStopBtn();
  const statusDiv = elements.getStatusDiv();
  if (!portal || !portal.client) return alert("Connect to a node first!");
  if (!scanning) {
    // Clear previous blocks
    const iframeDoc = elements.getBlocksIframe().contentDocument || elements.getBlocksIframe().contentWindow.document;
    if (iframeDoc && iframeDoc.body) iframeDoc.body.innerHTML = "";
    elements.getMatchesContainer().innerHTML = "";
    // Set search options
    const searchText = elements.getSearchInput().value.trim();
    portal.intelligence.scanner.prefix = searchText ? searchText : null;
    portal.intelligence.scanner.addresses = [];
    portal.intelligence.scanner.searchMode = SearchMode.INCLUDES;

    await portal.intelligence.scanner.start((block, matches) => {
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
    portal.intelligence.scanner.stop();
    scanning = false;
    startStopBtn.textContent = "Start";
    statusDiv.textContent = "Stopped.";
    renderUI.stopCountdown();
  }
}

export async function handleStartIndexerClick() {
  if (!portal || !portal.intelligence || !portal.intelligence.indexer) return;
  try {
    if (typeof portal.intelligence.indexer.freshStart === "function") {
      await portal.intelligence.indexer.freshStart();
    } else {
      await portal.intelligence.indexer.initDB();
      portal.intelligence.indexer.start();
    }
    renderUI.restartCountdown(portal.intelligence.indexer.ttlMs);
    renderUI.restartFlushCountdown(portal.intelligence.indexer.flushInterval);
  } catch (err) {
    console.error("Failed to start indexer:", err);
  }
}

export function handleStopIndexerClick() {
  renderUI.stopCountdown();
  renderUI.stopFlushCountdown();
  const countdownDiv = elements.getIndexerCountdownDiv();
  countdownDiv.textContent = "";
  portal.intelligence.indexer.stop();
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
  if (!portal || !portal.intelligence || !portal.intelligence.indexer) return;
  await portal.intelligence.indexer.clearStore(IndexerStore.MATCHING_TRANSACTIONS);
  renderUI.clearAllCachedSections();
}

export async function handleClearAllTxsClick() {
  if (!portal || !portal.intelligence || !portal.intelligence.indexer) return;
  await portal.intelligence.indexer.clearStore(IndexerStore.TRANSACTIONS);
  renderUI.clearAllCachedSections();
}

export async function handleClearBlocksClick() {
  if (!portal || !portal.intelligence || !portal.intelligence.indexer) return;
  await portal.intelligence.indexer.clearStore(IndexerStore.BLOCKS);
  renderUI.clearAllCachedSections();
}

export function handleCreateWalletClick() {
  const walletLoading = elements.getWalletLoading ? elements.getWalletLoading() : document.getElementById("walletLoading");
  walletLoading.style.display = "inline-block";
  setTimeout(async () => {
    if (!portal || !portal.client) return alert("Connect to a node first!");
    const { address } = await portal.identity.createWallet({ password: "1234" });
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
    await portal.send({ amount, toAddress, payload });
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
    scheduleInMemoryLiveSnapshot(); // render immediately on open
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
    scheduleCachedSnapshotRender(); // render immediately on open
  } else {
    content.style.display = "none";
    btn.textContent = "Cached Results (IndexedDB) ▼";
  }
}