// wallet_service.js
import { 
  Wallet, 
  Mnemonic,
  kaspaToSompi,
  sompiToKaspaString,
  AccountKind,
  AccountsDiscoveryKind,
  Address 
} from './kas-wasm/kaspa.js';

let wallet = null;
let walletInitialized = false;
let walletSecret = null;
let accountId = null;

export function init(rpcClient, networkId) {

  if (walletInitialized) return;

  // 1. Construct wallet with proper options
  wallet = new Wallet({
    resident: false,
    networkId,
    resolver: rpcClient.resolver || undefined
  });

  // Add the balance event listener to update balance on changes
  wallet.addEventListener("balance", (event) => {

    const bal = event?.data?.balance;
    
    if (bal && typeof bal.mature !== "undefined") {
    
      const matureBalance = sompiToKaspaString(bal.mature);
    
      // You can update your UI or call a callback here    
      console.log("Balance changed:", matureBalance, "KAS");
    
      // Example: update a DOM element    
      const balanceResult = document.getElementById("balanceResult");
    
      if (balanceResult) {    
        balanceResult.textContent = `Balance:\n${matureBalance} KAS`;    
      }    
    } 
  });

  walletInitialized = true;
}

export async function createWallet({ password, filename = "default_wallet", userHint = "", mnemonic = null }) {

  if (!walletInitialized) {
    throw new Error("Wallet not initialized. Call init() first.");
  }

  walletSecret = password;

  // 2. Create or import mnemonic
  const mnemonicPhrase = mnemonic || Mnemonic.random().phrase;

  // 3. Create wallet file
  const descriptor = await wallet.walletCreate({
    filename,
    overwriteWalletStorage: true,
    title: filename,
    userHint,
    walletSecret: password
  });
  
  // 4. Open wallet
  await wallet.walletOpen({ filename, walletSecret: password });

  // 5. Insert mnemonic key
  const prvKey = await wallet.prvKeyDataCreate({
    kind: "mnemonic",
    mnemonic: mnemonicPhrase,
    walletSecret: password
  });

  // 6. Create default account  
  const account = await wallet.accountsEnsureDefault({  
    walletSecret: password,  
    type: new AccountKind('bip32')  
  });

  accountId = account.accountDescriptor.accountId;  
  
  // 7. Get first receive address
  const addr = await wallet.accountsCreateNewAddress({  
    accountId: account.accountDescriptor.accountId,  
    addressKind: "receive"  
  });

  // 8. Connect and start wallet
  await wallet.connect();  
  await wallet.start();

  // 9. Perform accounts discovery to sync with network if you are importing existing wallet
  await wallet.accountsDiscovery({
    accountScanExtent: 5,              // scan first 5 accounts
    addressScanExtent: 5,             // scan first 5 addresses per account
    bip39_mnemonic: mnemonicPhrase, 
    discoveryKind: AccountsDiscoveryKind.BIP44
  });

  // Activate account to enable balance tracking
  await wallet.accountsActivate({ accountId });

  // Return mnemonic for backup
  return {mnemonic:mnemonicPhrase, address: account.accountDescriptor.receiveAddress};
}

export async function getSpendableBalance() {

  const res = await wallet.accountsGet({ accountId });

  let bal = null;

  if (res.account?.balance) {
    bal = res.account.balance;
  } else if (res.accounts?.[0]?.balance) {
    bal = res.accounts[0].balance;
  } else if (res.accountDescriptor?.balance) {
    bal = res.accountDescriptor.balance;
  }

  if (!bal || !bal.mature) {
    return 0n;
  }

  return BigInt(bal.mature);
}

export async function send({ amount, toAddress, payload, priorityFeeKas }) {
 
  if (!walletInitialized || !wallet) {
    throw new Error("Wallet not initialized. Call init() first.");
  }

  // Determine priority fee:
  // - If custom fee provided: use it as extra priority fee on top of base network fee
  // - If no custom fee: use 0 (dust-floor / minimum required by network based on mass)
  // - Smallest amount I've seen send successfully is 0.0000019 KAS without any payload
  let priorityFeeSompi = 0n;
  if(priorityFeeKas > 0) {
    priorityFeeSompi = kaspaToSompi(priorityFeeKas);
  }  

  // Check balance
  let spendable;
  spendable = await getSpendableBalance();
  
  // Convert amount to sompi and ensure BigInt
  let amountSompi;
    amountSompi = kaspaToSompi(amount.toString());
    if (amountSompi <= 0n) {
      throw new Error("Amount must be greater than zero.");
    }
  
  // Ensure priorityFeeSompi is BigInt
  let priorityFeeSompiChecked = priorityFeeSompi;
  if (typeof priorityFeeSompiChecked !== "bigint") {
    priorityFeeSompiChecked = BigInt(priorityFeeSompiChecked);    
  }
  
  // Calculate required total and check against spendable
  let required;
  required = amountSompi + priorityFeeSompiChecked;
  if (spendable < required) {
    throw new Error(
      `Insufficient funds: required ${required.toString()}, available ${spendable.toString()}`
    );
  }

  // Convert address string to Address object
  let addressObj = toAddress;
  if (typeof toAddress === "string") {
    addressObj = new Address(toAddress);
  }
  
  // Build request - priorityFeeSompi is extra fee on top of the base network fee
  const sendRequest = {
    walletSecret: walletSecret,
    accountId: accountId,
    priorityFeeSompi: priorityFeeSompiChecked,
    destination: [{
      address: addressObj,
      amount: amountSompi
    }]
  };

  // Payload
  if (payload) {
    if (!validatePayload(payload)) {
      throw new Error('Payload must be a string and <= 32KB');
    }
    const hex = stringToHex(payload);
    if (hex.length % 2 !== 0) {
      throw new Error('Invalid hex payload');
    }
    if (hex.length / 2 > 32 * 1024) {
      throw new Error('Payload too large');
    }
    sendRequest.payload = hex;
  }

  try {
    return await wallet.accountsSend(sendRequest);
  } catch (err) {
    throw new Error('Transaction failed', err);
  }
}


// Helpers
const MAX_PAYLOAD_BYTES = 32 * 1024; // 32KB

export function stringToHex(str) {
  // Convert a JS string to a hex-encoded byte string (UTF-8)
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToString(hex) {
  // Remove optional "0x" prefix
  if (hex.startsWith("0x")) hex = hex.slice(2);

  // Convert hex → bytes → UTF‑8 string
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );

  return new TextDecoder().decode(bytes);
}

export function validatePayload(payload) {
  if (typeof payload !== 'string') return false;
  if (payload.length > MAX_PAYLOAD_BYTES * 2) return false;
  return true;
}