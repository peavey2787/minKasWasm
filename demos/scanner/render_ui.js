// render_ui.js
// UI rendering functions for scanner
import * as elements from './dom_elements.js';

let indexerCountdownInterval = null;
let indexerCountdownStart = null;
let flushCountdownInterval = null;
let flushCountdownStart = null;

const MAX_MATCH_ROWS = 300;
const MAX_SNAPSHOT_ROWS = 200;
const MAX_BLOCK_ROWS = 300;

export function addBlockToUI(block, match, matchedPayload) {
  const txCount = Array.isArray(block.transactions) ? block.transactions.length : 0;
  const header = block.header;
  const payloadText = match && matchedPayload ? ` | Payload: ${matchedPayload}` : "";
  const blockText = `Hash: ${header?.hash?.slice(0,6)}... | BlueScore: ${header?.blueScore} | Txs: ${txCount}${payloadText}`;

  if (match) {
    const div = document.createElement("div");
    div.className = "block match";
    div.textContent = blockText;
    const container = elements.getMatchesContainer();
    container.prepend(div);

    while (container.childElementCount > MAX_MATCH_ROWS) {
      container.removeChild(container.lastElementChild);
    }
  } else {
    const iframeDoc = elements.getBlocksIframe().contentDocument || elements.getBlocksIframe().contentWindow.document;
    if (!iframeDoc.body) return;
    const div = iframeDoc.createElement("div");
    div.className = "block";
    div.textContent = blockText;
    iframeDoc.body.insertBefore(div, iframeDoc.body.firstChild);

    while (iframeDoc.body.childElementCount > MAX_BLOCK_ROWS) {
      iframeDoc.body.removeChild(iframeDoc.body.lastElementChild);
    }
  }
}

export function renderSection({ item, container, itemClass, infoColor = "#e67e22", getItemText }) {
  // If container is an iframe, use its document body
  let targetDoc, targetContainer;
  if (container.tagName === "IFRAME") {
    targetDoc = container.contentDocument || container.contentWindow.document;
    targetContainer = targetDoc.body;
  } else {
    targetContainer = container;
  }

  const div = (targetDoc ? targetDoc.createElement("div") : document.createElement("div"));
  div.className = itemClass;
  div.textContent = getItemText(item);

  // Set data attribute for removal lookup
  if (item.txid) div.setAttribute("data-txid", item.txid);
  const hash = item?.hash || item?.header?.hash;
  if (hash) div.setAttribute("data-hash", hash);

  targetContainer.insertBefore(div, targetContainer.children[1] || null);

  // Info bar is still in the main document
  const baseId = container.id.replace(/Div$/, '');
  const infoBarGetterName = 'get' + baseId.charAt(0).toUpperCase() + baseId.slice(1) + 'InfoBar';
  let infoBarElem = elements[infoBarGetterName]?.();

  updateInfoBarOnAdd({ infoBarElem, newTimestamp: item.timestamp, infoColor });
}

export function updateInfoBarOnAdd({ infoBarElem, newTimestamp, infoColor }) {
  if (!infoBarElem) return;
  let count = 0;
  let oldest = null;
  let newest = null;

  // Parse current info bar state
  if (infoBarElem.textContent) {
    const match = infoBarElem.textContent.match(/Count: (\d+)(?: \| Oldest: ([^|]+))?(?: \| Newest: ([^|]+))?/);
    if (match) {
      count = parseInt(match[1], 10) || 0;
      oldest = match[2] ? new Date(match[2]) : null;
      newest = match[3] ? new Date(match[3]) : null;
    }
  }

  count += 1;
  const ts = Number(newTimestamp);
  const newDate = Number.isFinite(ts) ? new Date(ts) : new Date(newTimestamp);
  if (!Number.isNaN(newDate.getTime())) {
    if (!oldest || newDate < oldest) oldest = newDate;
    if (!newest || newDate > newest) newest = newDate;
  }

  infoBarElem.style = `color:${infoColor};font-size:0.98em;margin-bottom:0.5em;`;
  infoBarElem.textContent = `Count: ${count} | Oldest: ${oldest ? oldest.toLocaleString() : ""} | Newest: ${newest ? newest.toLocaleString() : ""}`;
}

export function clearAllCachedSections() {
  clearIframeContainer(elements.getIndexerAllTxsDiv());
  clearIframeContainer(elements.getIndexerMatchingTxsDiv());
  clearIframeContainer(elements.getIndexerBlocksDiv());

  const allTxBar = elements.getIndexerAllTxsInfoBar?.();
  const matchTxBar = elements.getIndexerMatchingTxsInfoBar?.();
  const blocksBar = elements.getIndexerBlocksInfoBar?.();
  if (allTxBar) allTxBar.textContent = "Count: 0 | Oldest:  | Newest: ";
  if (matchTxBar) matchTxBar.textContent = "Count: 0 | Oldest:  | Newest: ";
  if (blocksBar) blocksBar.textContent = "Count: 0 | Oldest:  | Newest: ";
}

export function updateInfoBarAfterRemoval(container, itemClass, infoBarElem) {
  if (!infoBarElem) return;
  let prevCount = 0, oldest = "", newest = "";
  if (infoBarElem.textContent) {
    // This regex will always match, even if oldest/newest are empty
    const match = infoBarElem.textContent.match(
      /Count: (\d+)\s*\|\s*Oldest: ([^|]*)\s*\|\s*Newest: (.*)/
    );
    if (match) {
      prevCount = parseInt(match[1], 10) || 0;
      oldest = typeof match[2] === "string" ? match[2].trim() : "";
      newest = typeof match[3] === "string" ? match[3].trim() : "";
    }
  }
  const count = Math.max(prevCount - 1, 0);
  // Always show all fields, never undefined
  infoBarElem.textContent = `Count: ${count} | Oldest: ${oldest} | Newest: ${newest}`;
}

export async function renderAllIndexerSections(indexer) {
  if (!indexer) return;
  // Render cached (IndexedDB) sections
  const [allTxs, matchingTxs, blocks] = await Promise.all([
    indexer.getAllCachedTransactions(),
    indexer.getAllCachedMatchingTransactions(),
    indexer.getAllCachedBlocks()
  ]);
  renderAllTransactionsSection(allTxs);
  renderMatchingTransactionsSection(matchingTxs);
  renderAllBlocksSection(blocks);
}

export function renderMatchingTransactionsSection(matchingTxs) {
  const container = elements.getIndexerMatchingTxsDiv();
  const infoBar = elements.getIndexerMatchingTxsInfoBar();
  const items = Array.isArray(matchingTxs) ? matchingTxs : (matchingTxs ? [matchingTxs] : []);
  renderIframeSnapshot({
    items,
    container,
    infoBarElem: infoBar,
    infoColor: "#49eacb",
    itemClass: "indexer-tx",
    getItemText: tx => `TxID: ${tx.txid?.slice(0,8)}... | Time: ${new Date(tx.timestamp).toLocaleTimeString()}`,
    keyAttr: "data-txid",
    keyGetter: (tx) => tx?.txid
  });
}

export function renderAllTransactionsSection(allTxs) {
  const container = elements.getIndexerAllTxsDiv();
  const infoBar = elements.getIndexerAllTxsInfoBar();
  const items = Array.isArray(allTxs) ? allTxs : (allTxs ? [allTxs] : []);
  renderIframeSnapshot({
    items,
    container,
    infoBarElem: infoBar,
    infoColor: "#49eacb",
    itemClass: "indexer-tx",
    getItemText: tx => `TxID: ${tx.txid?.slice(0,8)}... | Time: ${new Date(tx.timestamp).toLocaleTimeString()}`,
    keyAttr: "data-txid",
    keyGetter: (tx) => tx?.txid
  });
}

export function renderAllBlocksSection(blocks) {
  const container = elements.getIndexerBlocksDiv();
  const infoBar = elements.getIndexerBlocksInfoBar();
  const items = Array.isArray(blocks) ? blocks : (blocks ? [blocks] : []);
  renderIframeSnapshot({
    items,
    container,
    infoBarElem: infoBar,
    infoColor: "#49eacb",
    itemClass: "block indexed-block",
    getItemText: (block) => {
      const txCount = Array.isArray(block?.transactions) ? block.transactions.length : 0;
      const header = block?.header;
      return `Hash: ${header?.hash?.slice(0,6)}... | BlueScore: ${header?.blueScore} | Txs: ${txCount} | Time: ${new Date(block?.timestamp).toLocaleTimeString()}`;
    },
    keyAttr: "data-hash",
    keyGetter: (block) => block?.hash || block?.header?.hash
  });
}

export function renderInMemoryMatchingTransactionsSection(matchingTxs) {
  const container = elements.getInMemoryMatchingTxsDiv();
  const infoBar = elements.getInMemoryMatchingTxsInfoBar();
  const items = Array.isArray(matchingTxs) ? matchingTxs : (matchingTxs ? [matchingTxs] : []);
  renderIframeSnapshot({
    items,
    container,
    infoBarElem: infoBar,
    infoColor: "#e67e22",
    itemClass: "indexer-tx",
    getItemText: tx => `TxID: ${tx.txid?.slice(0,8)}... | Time: ${new Date(tx.timestamp).toLocaleTimeString()}`,
    keyAttr: "data-txid",
    keyGetter: (tx) => tx.txid
  });
}

export function renderInMemoryAllTransactionsSection(allTxs) {
  const container = elements.getInMemoryAllTxsDiv();
  const infoBar = elements.getInMemoryAllTxsInfoBar();
  const items = Array.isArray(allTxs) ? allTxs : (allTxs ? [allTxs] : []);
  renderIframeSnapshot({
    items,
    container,
    infoBarElem: infoBar,
    infoColor: "#e67e22",
    itemClass: "indexer-tx",
    getItemText: tx => `TxID: ${tx.txid?.slice(0,8)}... | Time: ${new Date(tx.timestamp).toLocaleTimeString()}`,
    keyAttr: "data-txid",
    keyGetter: (tx) => tx.txid
  });
}

export function renderInMemoryBlocksSection(blocks) {
  const container = elements.getInMemoryBlocksDiv();
  const infoBar = elements.getInMemoryBlocksInfoBar();
  const items = Array.isArray(blocks) ? blocks : (blocks ? [blocks] : []);
  renderIframeSnapshot({
    items,
    container,
    infoBarElem: infoBar,
    infoColor: "#e67e22",
    itemClass: "block indexed-block",
    getItemText: (block) => {
      const txCount = Array.isArray(block.transactions) ? block.transactions.length : 0;
      const header = block.header;
      return `Hash: ${header?.hash?.slice(0,6)}... | BlueScore: ${header?.blueScore} | Txs: ${txCount} | Time: ${new Date(block.timestamp).toLocaleTimeString()}`;
    },
    keyAttr: "data-hash",
    keyGetter: (block) => block?.hash || block?.header?.hash
  });
}

function clearIframeContainer(container) {
  if (!container) return;
  if (container.tagName !== "IFRAME") return;
  const iframeDoc = container.contentDocument || container.contentWindow?.document;
  if (iframeDoc && iframeDoc.body) iframeDoc.body.innerHTML = "";
}


function renderIframeSnapshot({ items, container, infoBarElem, infoColor, itemClass, getItemText, keyAttr, keyGetter }) {
  clearIframeContainer(container);

  const iframeDoc = container?.contentDocument || container?.contentWindow?.document;
  const body = iframeDoc?.body;
  if (!body) return;

  // Cap render to avoid massive DOM churn
  const sliced = items.length > MAX_SNAPSHOT_ROWS ? items.slice(items.length - MAX_SNAPSHOT_ROWS) : items;

  const fragment = iframeDoc.createDocumentFragment();
  const count = items.length;

  let oldestTs = null;
  let newestTs = null;

  for (let i = sliced.length - 1; i >= 0; i--) {
    const item = sliced[i];
    const el = iframeDoc.createElement("div");
    el.className = itemClass;
    el.textContent = getItemText(item);

    const key = keyGetter?.(item);
    if (key) el.setAttribute(keyAttr, key);

    fragment.appendChild(el);

    const ts = Number(item?.timestamp);
    if (!Number.isNaN(ts)) {
      if (oldestTs === null || ts < oldestTs) oldestTs = ts;
      if (newestTs === null || ts > newestTs) newestTs = ts;
    }
  }

  body.appendChild(fragment);

  if (infoBarElem) {
    infoBarElem.style = `color:${infoColor};font-size:0.98em;margin-bottom:0.5em;`;
    const oldest = oldestTs === null ? "" : new Date(oldestTs).toLocaleString();
    const newest = newestTs === null ? "" : new Date(newestTs).toLocaleString();
    const renderedNote = items.length > MAX_SNAPSHOT_ROWS ? ` (showing last ${MAX_SNAPSHOT_ROWS})` : "";
    infoBarElem.textContent = `Count: ${count}${renderedNote} | Oldest: ${oldest} | Newest: ${newest}`;
  }
}

function queryIframeElement(container, selector) {
  if (!container || container.tagName !== "IFRAME") return null;
  const iframeDoc = container.contentDocument || container.contentWindow?.document;
  if (!iframeDoc) return null;
  return iframeDoc.querySelector(selector);
}

export function removeMatchingTransactionFromUI(txid) {
  const container = elements.getIndexerMatchingTxsDiv();
  const el = queryIframeElement(container, `[data-txid="${txid}"]`);
  if (el) {
    el.remove();
    updateInfoBarAfterRemoval(container, "indexer-tx", elements.getIndexerMatchingTxsInfoBar());
  }
}
export function removeTransactionFromUI(txid) {
  const container = elements.getIndexerAllTxsDiv();
  const el = queryIframeElement(container, `[data-txid="${txid}"]`);
  if (el) {
    el.remove();
    updateInfoBarAfterRemoval(container, "indexer-tx", elements.getIndexerAllTxsInfoBar());
  }
}

export function removeBlockFromUI(hash) {
  const container = elements.getIndexerBlocksDiv();
  const el = queryIframeElement(container, `[data-hash="${hash}"]`);
  if (el) {
    el.remove();
    updateInfoBarAfterRemoval(container, "block", elements.getIndexerBlocksInfoBar());
  }
}

export function removeInMemoryMatchingTransactionFromUI(txid) {
  const container = elements.getInMemoryMatchingTxsDiv();
  const el = queryIframeElement(container, `[data-txid="${txid}"]`);
  if (el) {
    el.remove();
    updateInfoBarAfterRemoval(container, "indexer-tx", elements.getInMemoryMatchingTxsInfoBar());
  }
}

export function removeInMemoryTransactionFromUI(txid) {
  const container = elements.getInMemoryAllTxsDiv();
  const el = queryIframeElement(container, `[data-txid="${txid}"]`);
  if (el) {
    el.remove();
    updateInfoBarAfterRemoval(container, "indexer-tx", elements.getInMemoryAllTxsInfoBar());
  }
}

export function removeInMemoryBlockFromUI(hash) {
  const container = elements.getInMemoryBlocksDiv();
  const el = queryIframeElement(container, `[data-hash="${hash}"]`);
  if (el) {
    el.remove();
    updateInfoBarAfterRemoval(container, "block", elements.getInMemoryBlocksInfoBar());
  }
}

export function restartCountdown(ttlMs) {
  if (indexerCountdownInterval) {
    clearInterval(indexerCountdownInterval);
    indexerCountdownInterval = null;
  }
  indexerCountdownStart = Date.now();
  indexerCountdownInterval = setInterval(() => {
    updateCountdown(ttlMs, indexerCountdownStart);
  }, 1000);
  updateCountdown(ttlMs, indexerCountdownStart);
}

export function updateCountdown(ttlMs, startTime) {
  const countdownDiv = elements.getIndexerCountdownDiv();
  if (!ttlMs || !countdownDiv) return;
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(ttlMs - elapsed, 0);
  countdownDiv.textContent = `Indexer TTL: ${Math.ceil(remaining / 1000)}s`;
  if (remaining <= 0) {
    countdownDiv.textContent = "Indexer TTL expired";
    if (indexerCountdownInterval) {
      restartCountdown(ttlMs);
    }
  }
}

export function stopCountdown() {
  if (indexerCountdownInterval) {
    clearInterval(indexerCountdownInterval);
    indexerCountdownInterval = null;
  }
  indexerCountdownStart = null;
  const countdownDiv = elements.getIndexerCountdownDiv();
  if (countdownDiv) countdownDiv.textContent = "";
}

export function restartFlushCountdown(flushMs) {
  if (flushCountdownInterval) {
    clearInterval(flushCountdownInterval);
    flushCountdownInterval = null;
  }
  flushCountdownStart = Date.now();
  flushCountdownInterval = setInterval(() => {
    updateFlushCountdown(flushMs, flushCountdownStart);
  }, 100);
  updateFlushCountdown(flushMs, flushCountdownStart);
}

export function updateFlushCountdown(flushMs, startTime) {
  const flushDiv = elements.getIndexerFlushCountdownDiv();
  if (!flushMs || !flushDiv) return;
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(flushMs - (elapsed % flushMs), 0);
  flushDiv.textContent = `Flush in: ${(remaining / 1000).toFixed(1)}s`;
  if (remaining <= 0) {
    flushDiv.textContent = "Flushing...";
  }
}

export function stopFlushCountdown() {
  if (flushCountdownInterval) {
    clearInterval(flushCountdownInterval);
    flushCountdownInterval = null;
  }
  const flushDiv = elements.getIndexerFlushCountdownDiv();
  flushDiv.textContent = "";
}