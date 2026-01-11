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

let walletInitialized = false;
let kaspaClient = null;
let scanner = null;
let scanning = false;

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
    scanner = new KaspaBlockScanner(kaspaClient);
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
  if (!scanning) {
    // Clear previous blocks
    const iframeDoc = blocksIframe.contentDocument || blocksIframe.contentWindow.document;
    if (iframeDoc && iframeDoc.body) iframeDoc.body.innerHTML = "";
    matchesContainer.innerHTML = "";
    // Set search mode and string
    const searchText = searchInput.value.trim().toLowerCase();
    scanner.setSearch(searchText, SearchMode.INCLUDES); // Could add UI for mode
    await scanner.start((block, match, matchedPayload) => {
      addBlockToUI(block, match, matchedPayload);
    });
    scanning = true;
    startStopBtn.textContent = "Stop";
    statusDiv.textContent = "Scanning...";
  } else {
    scanner.stop();
    scanning = false;
    startStopBtn.textContent = "Start";
    statusDiv.textContent = "Stopped.";
  }
};

createWalletBtn.onclick = () => {
  document.getElementById("walletLoading").style.display = "inline-block";
  setTimeout(async () => {
    if (!scanner || !kaspaClient) return alert("Connect to a node first!");
    const networkId = networkInput.value.trim();
    if(networkId === "public") {
      await init({rpcClient: kaspaClient, networkId: "mainnet"});
    } else {
      await init({rpcClient: kaspaClient, networkId});
    }
    const { address } = await createWallet({ password: "1234", balanceElementId: "balanceLabel" });
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