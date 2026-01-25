// dom_handlers.js
// All handler functions for scanner UI

import * as elements from "./dom_elements.js";
import {
  kaspaPortal,
  SearchMode,
  IndexerStore,
} from "../../wrapper/kaspaPortal.js";
import * as renderUI from "./render_ui.js";

// State (exported for controller)
export let walletInitialized = false;
export let scanning = false;
export let currentIndexerOptions = {};

let inMemoryRenderTimer = null;
const IN_MEMORY_RENDER_THROTTLE_MS = 250;

let cachedRenderTimer = null;
const CACHED_RENDER_THROTTLE_MS = 350;

let cachedFlushRefreshTimer = null;
let cachedTtlRefreshTimer = null;

function startCachedAutoRefresh(indexer) {
  stopCachedAutoRefresh();

  const flushMs = Math.max(500, indexer?.flushInterval || 5000);
  const ttlMs = Math.max(1000, indexer?.ttlMs || 600000);

  cachedFlushRefreshTimer = setInterval(
    () => scheduleCachedSnapshotRender(),
    flushMs,
  );

  cachedTtlRefreshTimer = setInterval(
    () => scheduleCachedSnapshotRender(),
    ttlMs,
  );
}

function stopCachedAutoRefresh() {
  if (cachedFlushRefreshTimer) {
    clearInterval(cachedFlushRefreshTimer);
    cachedFlushRefreshTimer = null;
  }
  if (cachedTtlRefreshTimer) {
    clearInterval(cachedTtlRefreshTimer);
    cachedTtlRefreshTimer = null;
  }
}

function renderInMemoryLiveSnapshot() {
  if (
    !kaspaPortal ||
    !kaspaPortal.intelligence ||
    !kaspaPortal.intelligence.indexer
  )
    return;
  renderUI.renderInMemoryAllTransactionsSection(
    kaspaPortal.intelligence.indexer.getAllTransactions(),
  );
  renderUI.renderInMemoryMatchingTransactionsSection(
    kaspaPortal.intelligence.indexer.getAllMatchingTransactions(),
  );
  renderUI.renderInMemoryBlocksSection(
    kaspaPortal.intelligence.indexer.getAllBlocks(),
  );
}

function isInMemoryPanelOpen() {
  const content = elements.getInMemorySections();
  return (
    !!content &&
    content.style.display !== "none" &&
    content.style.display !== ""
  );
}

function isCachedPanelOpen() {
  const content = elements.getCachedSections();
  return (
    !!content &&
    content.style.display !== "none" &&
    content.style.display !== ""
  );
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
  if (
    !kaspaPortal ||
    !kaspaPortal.intelligence ||
    !kaspaPortal.intelligence.indexer
  )
    return;

  if (cachedRenderTimer) return;
  cachedRenderTimer = setTimeout(async () => {
    cachedRenderTimer = null;
    await renderUI.renderAllIndexerSections(kaspaPortal.intelligence.indexer);
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
    const indexAllTransactions =
      elements.getIndexAllTransactionsCheckbox().checked;
    const indexAllMatchingTransactions =
      elements.getIndexAllMatchingTransactionsCheckbox().checked;
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
        inMemoryMaxBlocks: inMemoryMax,
        onIndexerUpdate: (evt) => {
          if (!evt || !evt.type) return;
          if (
            evt.type === "transaction-in-memory" ||
            evt.type === "matching-transaction-in-memory" ||
            evt.type === "block-in-memory" ||
            evt.type === "evict"
          ) {
            scheduleInMemoryLiveSnapshot();
          }
          if (
            evt.type === "transaction-cached" ||
            evt.type === "matching-transaction-cached" ||
            evt.type === "block-cached"
          ) {
            scheduleCachedSnapshotRender();
          }
        },
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
        inMemoryMaxBlocks: inMemoryMax,
        onIndexerUpdate: (evt) => {
          if (!evt || !evt.type) return;
          if (
            evt.type === "transaction-in-memory" ||
            evt.type === "matching-transaction-in-memory" ||
            evt.type === "block-in-memory" ||
            evt.type === "evict"
          ) {
            scheduleInMemoryLiveSnapshot();
          }
          if (
            evt.type === "transaction-cached" ||
            evt.type === "matching-transaction-cached" ||
            evt.type === "block-cached"
          ) {
            scheduleCachedSnapshotRender();
          }
        },
      };
    }

    await kaspaPortal.init();

    await kaspaPortal.connect({
      rpcUrl: usePublicResolver ? null : url,
      networkId,
      startIntelligence: false,
      balanceElementId: "balanceResult",
      indexerOptions: currentIndexerOptions,
    });

    kaspaPortal
      .onNewTransaction(() => scheduleInMemoryLiveSnapshot())
      .onNewTransactionMatch(() => scheduleInMemoryLiveSnapshot())
      .onNewBlock(() => scheduleInMemoryLiveSnapshot())
      .onCachedTransaction(() => scheduleCachedSnapshotRender())
      .onCachedTransactionMatch(() => scheduleCachedSnapshotRender())
      .onCachedBlock(() => scheduleCachedSnapshotRender())
      .onEvict(() => scheduleInMemoryLiveSnapshot())
      .onCacheEvict(() => scheduleCachedSnapshotRender());

    statusDiv.textContent = "Connected";

    renderUI.renderAllIndexerSections(kaspaPortal.intelligence.indexer);
    scheduleInMemoryLiveSnapshot();
  } catch (err) {
    console.error("Connection error:", err);
    statusDiv.textContent =
      "Connection failed: " + (err && err.message ? err.message : err);
  }
}

export async function handleStartStopClick() {
  const startStopBtn = elements.getStartStopBtn();
  const statusDiv = elements.getStatusDiv();
  if (!kaspaPortal || !kaspaPortal.client)
    return alert("Connect to a node first!");
  if (!scanning) {
    // Clear previous blocks
    const iframeDoc =
      elements.getBlocksIframe().contentDocument ||
      elements.getBlocksIframe().contentWindow.document;
    if (iframeDoc && iframeDoc.body) iframeDoc.body.innerHTML = "";
    elements.getMatchesContainer().innerHTML = "";
    // Set search options
    const searchText = elements.getSearchInput().value.trim();
    kaspaPortal.intelligence.scanner.addPrefix(searchText);
    kaspaPortal.intelligence.scanner.addresses = [];
    kaspaPortal.intelligence.scanner.searchMode = SearchMode.INCLUDES;

    await kaspaPortal.intelligence.scanner.start((block, matches) => {
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
    kaspaPortal.intelligence.scanner.stop();
    scanning = false;
    startStopBtn.textContent = "Start";
    statusDiv.textContent = "Stopped.";
    renderUI.stopCountdown();
  }
}

export async function handleStartIndexerClick() {
  if (
    !kaspaPortal ||
    !kaspaPortal.intelligence ||
    !kaspaPortal.intelligence.indexer
  )
    return;
  console.log("Starting indexer...");
  try {
    const idx = kaspaPortal.intelligence.indexer;
    idx.start();
    console.log("Indexer started.");
    renderUI.restartCountdown(kaspaPortal.intelligence.indexer.ttlMs);
    renderUI.restartFlushCountdown(
      kaspaPortal.intelligence.indexer.flushInterval,
    );
    startCachedAutoRefresh(idx);
    scheduleCachedSnapshotRender();
  } catch (err) {
    console.error("Failed to start indexer:", err);
  }
}

export function handleStopIndexerClick() {
  renderUI.stopCountdown();
  renderUI.stopFlushCountdown();
  const countdownDiv = elements.getIndexerCountdownDiv();
  countdownDiv.textContent = "";
  kaspaPortal.intelligence.indexer.stop();
  stopCachedAutoRefresh();
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
  if (
    !kaspaPortal ||
    !kaspaPortal.intelligence ||
    !kaspaPortal.intelligence.indexer
  )
    return;
  await kaspaPortal.intelligence.indexer.clearStore(
    IndexerStore.MATCHING_TRANSACTIONS,
  );
  renderUI.clearAllCachedSections();
}

export async function handleClearAllTxsClick() {
  if (
    !kaspaPortal ||
    !kaspaPortal.intelligence ||
    !kaspaPortal.intelligence.indexer
  )
    return;
  await kaspaPortal.intelligence.indexer.clearStore(IndexerStore.TRANSACTIONS);
  renderUI.clearAllCachedSections();
}

export async function handleClearBlocksClick() {
  if (
    !kaspaPortal ||
    !kaspaPortal.intelligence ||
    !kaspaPortal.intelligence.indexer
  )
    return;
  await kaspaPortal.intelligence.indexer.clearStore(IndexerStore.BLOCKS);
  renderUI.clearAllCachedSections();
}

export function handleCreateWalletClick() {
  const walletLoading = elements.getWalletLoading
    ? elements.getWalletLoading()
    : document.getElementById("walletLoading");
  walletLoading.style.display = "inline-block";
  setTimeout(async () => {
    if (!kaspaPortal || !kaspaPortal.client)
      return alert("Connect to a node first!");
    const { address } = await kaspaPortal.createOrOpenWallet({
      password: "1234",
    });
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
    await kaspaPortal.send({ amount, toAddress, payload });
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
      setTimeout(() => (copyBtn.textContent = "Copy"), 1000);
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
