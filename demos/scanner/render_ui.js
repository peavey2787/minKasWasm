// render_ui.js
// UI rendering functions for scanner
import * as elements from './dom_elements.js';

let indexerCountdownInterval = null;
let indexerCountdownStart = null;

export function addBlockToUI(block, match, matchedPayload) {
  const txCount = Array.isArray(block.transactions) ? block.transactions.length : 0;
  const header = block.header;
  const payloadText = match && matchedPayload ? ` | Payload: ${matchedPayload}` : "";
  const blockText = `Hash: ${header?.hash?.slice(0,6)}... | BlueScore: ${header?.blueScore} | Txs: ${txCount}${payloadText}`;
  if (match) {
    const div = document.createElement("div");
    div.className = "block match";
    div.textContent = blockText;
    elements.getMatchesContainer().prepend(div);
  } else {
    const iframeDoc = elements.getBlocksIframe().contentDocument || elements.getBlocksIframe().contentWindow.document;
    if (!iframeDoc.body) return;
    const div = iframeDoc.createElement("div");
    div.className = "block";
    div.textContent = blockText;
    iframeDoc.body.insertBefore(div, iframeDoc.body.firstChild);
  }
}

function renderSection({ items, container, itemClass, infoColor, getItemText, getOldest }) {
  container.innerHTML = "";
  const count = items.length;
  let oldest = null;
  if (count > 0 && getOldest) {
    oldest = items.reduce(getOldest, items[0]);
  }
  const infoDiv = document.createElement("div");
  infoDiv.style = `color:${infoColor};font-size:0.98em;margin-bottom:0.5em;`;
  if (count > 0 && oldest && oldest.timestamp) {
    const date = new Date(oldest.timestamp);
    infoDiv.textContent = `Count: ${count} | Oldest: ${date.toLocaleString()} (${oldest.timestamp})`;
  } else {
    infoDiv.textContent = `Count: ${count}`;
  }
  container.appendChild(infoDiv);
  for (const item of items.slice().reverse()) {
    const div = document.createElement("div");
    div.className = itemClass;
    div.textContent = getItemText(item);
    container.appendChild(div);
  }
}

export async function renderAllIndexerSections(scanner) {
  if (!scanner || !scanner.indexer) return;
  await renderMatchingTransactionsSection(scanner);
  await renderAllTransactionsSection(scanner);
  await renderAllBlocksSection(scanner);
}

export async function renderMatchingTransactionsSection(scanner) {
  const matchingTxs = await scanner.indexer.getAllMatchingTransactions();
  renderSection({
    items: matchingTxs,
    container: elements.getIndexerMatchingTxsDiv(),
    itemClass: "indexer-tx",
    infoColor: "#49eacb",
    getItemText: tx => `TxID: ${tx.txid?.slice(0,8)}... | Time: ${new Date(tx.timestamp).toLocaleTimeString()}`,
    getOldest: (min, t) => (t.timestamp < min.timestamp ? t : min)
  });
}

export async function renderAllTransactionsSection(scanner) {
  const allTxs = await scanner.indexer.getAllTransactions();
  renderSection({
    items: allTxs,
    container: elements.getIndexerAllTxsDiv(),
    itemClass: "indexer-tx",
    infoColor: "#49eacb",
    getItemText: tx => `TxID: ${tx.txid?.slice(0,8)}... | Time: ${new Date(tx.timestamp).toLocaleTimeString()}`,
    getOldest: (min, t) => (t.timestamp < min.timestamp ? t : min)
  });
}

export async function renderAllBlocksSection(scanner) {
  const blocks = await scanner.indexer.getAllBlocks();
  renderSection({
    items: blocks,
    container: elements.getIndexerBlocksDiv(),
    itemClass: "block indexed-block",
    infoColor: "#49eacb",
    getItemText: block => {
      const txCount = Array.isArray(block.transactions) ? block.transactions.length : 0;
      const header = block.header;
      return `Hash: ${header?.hash?.slice(0,6)}... | BlueScore: ${header?.blueScore} | Txs: ${txCount}`;
    },
    getOldest: (min, b) => (b.timestamp < min.timestamp ? b : min)
  });
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