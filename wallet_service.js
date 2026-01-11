// wallet_service.js
import { 
  Wallet,  
  kaspaToSompi,
  sompiToKaspaString,
  AccountKind,
  AccountsDiscoveryKind,
  Address,
  PrivateKeyGenerator,
  PublicKeyGenerator,
  NetworkType
} from './kas-wasm/kaspa.js';
import { storeWalletData } from './storage.js';
import * as utilities from './utilities.js';

const DEFAULT_FILENAME = "default_wallet";
let wallet = null;
let walletInitialized = false;
let walletSecret = null;
let accountId = null;
let filename = DEFAULT_FILENAME;

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

export async function createWallet({ password, filename = DEFAULT_FILENAME, userHint = "", mnemonic = null, storeMnemonic = false }) {

  if (!walletInitialized) {
    throw new Error("Wallet not initialized. Call init() first.");
  }

  console.log("Creating wallet...");

  walletSecret = password;
  filename = filename || DEFAULT_FILENAME;

  // 2. Create or import mnemonic
  const mnemonicPhrase = mnemonic || utilities.generateMnemonic(24);

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
    prvKeyDataId: prvKey.id,
    type: new AccountKind('bip32')  
  });

  accountId = account.accountDescriptor.accountId;  

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

  // Get extended private key for address derivation and diffie-hellman encryption
  const Xprv = await utilities.getXPrv(mnemonicPhrase);
  const xPrvString = Xprv.toString();

  // Store XPrv and optionally mnemonic securely in IndexedDB
  if (storeMnemonic) {
    storeWalletData({ filename, mnemonic: mnemonicPhrase, xprv: xPrvString }, password);
  } else {
    storeWalletData({ filename, xprv: xPrvString }, password);
  }
  
  console.log("Wallet created and opened successfully.");

  // Return mnemonic for backup
  return { 
    mnemonic: mnemonicPhrase,
    address: account.accountDescriptor.receiveAddress
  };
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
    if (!utilities.validatePayload(payload)) {
      throw new Error('Payload must be a string and <= 32KB');
    }
    const hex = utilities.stringToHex(payload);
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

export async function generateNewAddress(change = false) {   
  const addr = await wallet.accountsCreateNewAddress({  
    accountId: accountId,  
    networkId: wallet.networkId,
    addressKind: change ? "change" : "receive"  
  });
  return addr.address;
}

export async function generateNewKeypair(index) {
  const xprv = await utilities.getXPrvFromStorage(filename, walletSecret);
  const xprvHex = xprv.toString();
  const derivedKeyPair = await utilities.deriveReceivingChildKeyPair({xprvHex, index});
  return {
    privateKey: derivedKeyPair.privateKey,
    publicKey: derivedKeyPair.publicKey
  };
}