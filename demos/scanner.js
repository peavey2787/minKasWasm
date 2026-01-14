import { KaspaBlockScanner, SearchMode } from "../wrapper/scanner.js";
import { connect } from "../wrapper/kaspa_client.js";
import { init, createWallet, send } from "../wrapper/wallet_service.js";

const connectBtn = document.getElementById("connectBtn");
const nodeInput = document.getElementById("nodeInput");
const networkInput = document.getElementById("networkInput");
const publicResolverCheckbox = document.getElementById("publicResolverCheckbox");
const startStopBtn = document.getElementById("startStopBtn");
const searchInput = document.getElementById("searchInput");
const blocksIframe = document.getElementById("blocksIframe");
const matchesContainer = document.getElementById("matchesContainer");
const statusDiv = document.getElementById("statusDiv");
const createWalletBtn = document.getElementById("createWalletBtn");
const sendBtn = document.getElementById("sendBtn");
const toAddressInput = document.getElementById("toAddressInput");
const amountInput = document.getElementById("amountInput");
const payloadInput = document.getElementById("payloadInput");
const receiveAddressLabel = document.getElementById("receiveAddressLabel");
const sendResultLabel = document.getElementById("sendResult");
const copyBtn = document.getElementById("copyReceiveAddressBtn");
const indexerTxsDiv = document.getElementById("indexerTxs");

let walletInitialized = false;
let kaspaClient = null;
let scanner = null;


let scanning = false;
let indexerCountdownInterval = null;
let indexerCountdownStart = null;

// Countdown timer updater for indexer TTL (always counts down from Start)
function updateCountdown() {
  const countdownDiv = document.getElementById("indexerCountdown");
  if (!scanner || !scanner.indexer || !indexerCountdownStart) {
    countdownDiv.textContent = "";
    return;
  }
  const ttlMs = scanner.indexer.ttlMs;
  if (!ttlMs) {
    countdownDiv.textContent = "";
    return;
  }
  const now = Date.now();
  let msLeft = Math.max(0, (indexerCountdownStart + ttlMs) - now);
  if (msLeft <= 0) {
    countdownDiv.textContent = "Cache will evict soon.";
  } else {
    const min = Math.floor(msLeft / 60000);
    const sec = Math.floor((msLeft % 60000) / 1000);
    const minStr = min.toString().padStart(2, '0');
    const secStr = sec.toString().padStart(2, '0');
    countdownDiv.textContent = `Cache expires in: ${minStr}:${secStr}`;
  }
}

connectBtn.onclick = async () => {
  statusDiv.textContent = "Connecting...";
  const url = nodeInput.value.trim();
  const networkId = networkInput.value.trim();
  const usePublicResolver = publicResolverCheckbox.checked;
  try {
    kaspaClient = usePublicResolver
      ? await connect(null, networkId)
      : await connect(url, networkId);
    statusDiv.textContent = "Connected";

    // Get indexer options from UI
    const ttlInput = document.getElementById("indexerTtlInput");
    const maxSizeInput = document.getElementById("indexerMaxSizeInput");
    const priorityRadios = document.getElementsByName("indexerPriority");
    const ttlMinutes = parseInt(ttlInput?.value) || 10;
    const maxSize = parseInt(maxSizeInput?.value) || 500;
    let priorityTTL = true;
    for (const radio of priorityRadios) {
      if (radio.checked && radio.value === "size") priorityTTL = false;
    }
    const indexerOptions = {
      ttlMinutes,
      maxSize,
      priorityTTL,
      onEvict: ({ txid, reason }) => {
        const txDivs = indexerTxsDiv.querySelectorAll(`.indexer-tx[data-txid='${txid}']`);
        txDivs.forEach(div => div.remove());
        // Reset countdown timer on eviction
        indexerCountdownStart = Date.now();
        updateCountdown();
      },
      onTransaction: ({ match }) => {
        const div = document.createElement("div");
        div.className = "block match indexer-tx";
        div.dataset.txid = match.txid;
        div.innerHTML = `
          <div style="font-size:0.95em;color:#49eacb;word-break:break-all;"><strong>TXID:</strong> ${match.txid}</div>
          <div style="font-size:0.95em;"><strong>Payload:</strong> <span style="color:#fff;">${match.decodedPayload || "<em>none</em>"}</span></div>
        `;
        indexerTxsDiv.prepend(div);
      }
    };

    scanner = new KaspaBlockScanner(kaspaClient, { indexerOptions });
  } catch (err) {
    statusDiv.textContent = "Connection failed";
  }
};

function addBlockToUI(block, match, matchedPayload) {
  const txCount = Array.isArray(block.transactions) ? block.transactions.length : 0;
  const header = block.header;
  const payloadText = match && matchedPayload ? ` | Payload: ${matchedPayload}` : "";
  const blockText = `Hash: ${header?.hash?.slice(0,6)}... | BlueScore: ${header?.blueScore} | Txs: ${txCount}${payloadText}`;
  if (match) {
    const div = document.createElement("div");
    div.className = "block match";
    div.textContent = blockText;
    matchesContainer.prepend(div);
  } else {
    const iframeDoc = blocksIframe.contentDocument || blocksIframe.contentWindow.document;
    if (!iframeDoc.body) return;
    const div = iframeDoc.createElement("div");
    div.className = "block";
    div.textContent = blockText;
    iframeDoc.body.insertBefore(div, iframeDoc.body.firstChild);
  }
}

startStopBtn.onclick = async () => {
  if (!scanner || !kaspaClient) return alert("Connect to a node first!");
  const countdownDiv = document.getElementById("indexerCountdown");
  if (!scanning) {
    // Clear previous blocks
    const iframeDoc = blocksIframe.contentDocument || blocksIframe.contentWindow.document;
    if (iframeDoc && iframeDoc.body) iframeDoc.body.innerHTML = "";
    matchesContainer.innerHTML = "";
    // Set search options
    const searchText = searchInput.value.trim();
    scanner.prefix = searchText ? searchText : null;
    scanner.addresses = [];
    scanner.searchMode = SearchMode.INCLUDES;

    await scanner.start((block, matches) => {      
      addBlockToUI(block, null, null);
      for (const match of matches) {
        addBlockToUI(block, match, match.decodedPayload);
      }      
    });

    // Setup countdown timer for TTL (now that scanner/indexer is fully configured)
    if (indexerCountdownInterval) clearInterval(indexerCountdownInterval);
    indexerCountdownStart = Date.now();
    indexerCountdownInterval = setInterval(updateCountdown, 1000);
    updateCountdown();

    scanning = true;
    startStopBtn.textContent = "Stop";
    statusDiv.textContent = "Scanning...";
  } else {
    scanner.stop();
    scanning = false;
    startStopBtn.textContent = "Start";
    statusDiv.textContent = "Stopped.";
    if (indexerCountdownInterval) clearInterval(indexerCountdownInterval);
    indexerCountdownStart = null;
    countdownDiv.textContent = "";
  }
};

createWalletBtn.onclick = () => {
  document.getElementById("walletLoading").style.display = "inline-block";
  setTimeout(async () => {
    if (!scanner || !kaspaClient) return alert("Connect to a node first!");
    const networkId = networkInput.value.trim();
    if(networkId === "public") {
      await init({rpcClient: kaspaClient, networkId: "mainnet", balanceElementId: "balanceResult" });
    } else {
      await init({rpcClient: kaspaClient, networkId, balanceElementId: "balanceResult" });
    }
    const { address } = await createWallet({ password: "1234" });
    walletInitialized = true;
    receiveAddressLabel.textContent = address;
    toAddressInput.value = address;
    document.getElementById("walletLoading").style.display = "none";
  }, 0);
};

sendBtn.onclick = async () => {
  if (!walletInitialized) return alert("Create a wallet first!");
  const toAddress = toAddressInput.value.trim();
  const amount = amountInput.value.trim();
  let payload = payloadInput.value.trim();
  try {
    await send({ amount, toAddress, payload });
    sendResultLabel.textContent = "Transaction sent!";
  } catch (err) {
    sendResultLabel.textContent = "Send error: " + err.message;
  }
};

copyBtn.onclick = () => {
  const addr = receiveAddressLabel.textContent;
  if (addr) {
    navigator.clipboard.writeText(addr).then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => copyBtn.textContent = "Copy", 1000);
    });
  }
};