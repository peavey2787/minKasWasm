// wallet_service.js
import { 
  Wallet,  
  kaspaToSompi,
  sompiToKaspaString,
  AccountsDiscoveryKind,
  Address
} from '../kas-wasm/kaspa.js';
import { storeWalletData } from './storage.js';
import * as utilities from './utilities.js';


const DEFAULT_FILENAME = "default_wallet";
let wallet = null;
let walletInitialized = false;
let walletSecret = null;
let accountId = null;
let filename = DEFAULT_FILENAME;


/**
 * Initialize the Kaspa wallet with the given RPC client and network.
 * The provided rpcClient must already be connected.
 * Adds a balance event listener for UI/callback updates.
 * @param {Object} params
 * @param {Object} params.rpcClient - The Kaspa RPC client instance (must be connected).
 * @param {string} params.networkId - Network ID (e.g., 'mainnet', 'testnet-10').
 * @param {string|null} [params.balanceElementId] - Optional DOM element ID to update balance.
 * @param {function|null} [params.onBalanceChange] - Optional callback to receive balance updates.
 */ 
export function init({ rpcClient, networkId, balanceElementId = null, onBalanceChange = null} = {}) {

  if (walletInitialized) return;

  // 1. Construct wallet with proper options
  wallet = new Wallet({
    resident: false,
    networkId,
    resolver: rpcClient.resolver || undefined
  });

  // 2. Add the balance event listener to update balance on changes
  wallet.addEventListener("balance", (event) => {

    const bal = event?.data?.balance;
    
    if (bal && typeof bal.mature !== "undefined") {
    
      const matureBalance = sompiToKaspaString(bal.mature);
    
      // You can update your UI or call a callback here    
      console.log("Balance changed:", matureBalance, "KAS");
    
      // Example: update a DOM element
      let balanceResult = null;
      if(balanceElementId) {
        balanceResult = document.getElementById(balanceElementId);
        balanceResult.textContent = `Balance:\n${matureBalance} KAS`;    
      }

      if(typeof onBalanceChange === 'function') {
        onBalanceChange(matureBalance);
      }
    } 
  });

  walletInitialized = true;
}


/**
 * Create a new wallet or import from mnemonic. Stores wallet data securely.
 * @param {Object} params
 * @param {string} params.password - Password to encrypt wallet data.
 * @param {string} [params.filename] - Optional wallet filename.
 * @param {string} [params.userHint] - Optional user hint for wallet.
 * @param {string|null} [params.mnemonic] - Optional mnemonic phrase to import.
 * @param {boolean} [params.storeMnemonic] - Whether to store mnemonic in storage.
 * @param {boolean} [params.discoverAddresses] - Whether to perform address discovery.
 * @returns {Promise<{mnemonic: string, address: string}>} - The mnemonic and receiving address.
 */
export async function createWallet({ password, filename = DEFAULT_FILENAME, userHint = "", mnemonic = null, storeMnemonic = false, discoverAddresses = true }) {

  if (!walletInitialized) {
    throw new Error("Wallet not initialized. Call init() first.");
  }

  // 1. Set wallet secret and filename
  walletSecret = password;
  filename = filename || DEFAULT_FILENAME;

  // 2. Try to open the wallet (if it exists)
  try {
    console.log("Attempting to open wallet...");
    await wallet.walletOpen({ filename, walletSecret });
    // 3. Connect and start wallet
    await wallet.connect();  
    await wallet.start();
    // 4. Activate the account to get events like balance changes
    const address = await activateAccount();
    console.log("Wallet opened successfully.");  
    return { address };
  } catch (err) {
    // If wallet doesn't exist, proceed to create a new one
    return await _createNewWallet({ password, filename, userHint, mnemonic, storeMnemonic, discoverAddresses });
  }
}


/**
 * Internal function to create a new wallet.
 * @param {Object} params
 * @param {string} params.password - Password to encrypt wallet data.
 * @param {string} params.filename - Wallet filename.
 * @param {string} params.userHint - User hint for wallet.
 * @param {string|null} params.mnemonic - Mnemonic phrase to import.
 * @param {boolean} params.storeMnemonic - Whether to store mnemonic in storage.
 * @param {boolean} params.discoverAddresses - Whether to perform address discovery.
 * @returns {Promise<{mnemonic: string, address: string}>} - The mnemonic and receiving address.
 */
export async function _createNewWallet({ password, filename = DEFAULT_FILENAME, userHint = "", mnemonic = null, storeMnemonic = false, discoverAddresses = true }) {
  
  console.log("Creating new wallet...");
  
  // 1. Create or import mnemonic
  const mnemonicPhrase = mnemonic || utilities.generateMnemonic(24);

  // 2. Create wallet file
  try {
    const descriptor = await wallet.walletCreate({
      filename,
      overwriteWalletStorage: false,
      title: filename,
      userHint,
      walletSecret: password
    });
  } catch (err) {
    const msg = (err && err.message ? err.message : String(err));
    if (msg.includes("Wallet already exists")) {
      // Suppress this specific error, do nothing
    } else {
      // Propogate the error
      throw new Error("Error creating wallet: " + msg);
    }
  }

  // 3. Open wallet
  await wallet.walletOpen({ filename, walletSecret });

  // 4. Insert mnemonic key
  let prvKeyData =  await wallet.prvKeyDataCreate({
    walletSecret,
    kind: "mnemonic",
    mnemonic: mnemonicPhrase
  });

  // 5. Create account
  let account = await wallet.accountsCreate({
    walletSecret,
    type:"bip32",
    accountName:"Account-B",
    prvKeyDataId: prvKeyData.prvKeyDataId
  });

  accountId = account.accountDescriptor.accountId; 

  // 6. Get extended private key for address derivation and diffie-hellman encryption
  const xprv = await utilities.getXPrv(mnemonicPhrase);
  const xPrvString = xprv.toString();

  // 7. Store XPrv and optionally mnemonic securely in IndexedDB
  if (storeMnemonic) {
    storeWalletData({ filename, mnemonic: mnemonicPhrase, xprv: xPrvString }, password);
  } else {
    storeWalletData({ filename, xprv: xPrvString }, password);
  }

  // 8. Connect and start wallet
  await wallet.connect();  
  await wallet.start();

  // 9. Optionally, perform accounts discovery to sync with network
  // if you are importing existing wallet
  if(discoverAddresses) {
    const results = await wallet.accountsDiscovery({
      accountScanExtent: 10,              // scan first 10 accounts
      addressScanExtent: 50,             // scan first 50 addresses per account
      bip39_mnemonic: mnemonicPhrase, 
      discoveryKind: AccountsDiscoveryKind.BIP44
    });
  }

  // 10. Activate the account to get events like balance changes
  const address = await activateAccount();

  console.log("Wallet created and data stored securely.");

  return  { address, mnemonic: mnemonicPhrase };
}


/**
 * Activate the specified account index (default 0) to enable balance tracking.
 * @param {number} [accountIndex=0] - The account index to activate.
 * @returns {Promise<string>} - The receiving address of the activated account.
 */
export async function activateAccount(accountIndex = 0) {
    // 10. Activate account to enable balance tracking
  const accounts = await wallet.accountsEnumerate();
  accountId = accounts.accountDescriptors[accountIndex].accountId;
  const address = accounts.accountDescriptors[accountIndex].receiveAddress;
  await wallet.accountsActivate({ accountId });
  return address;
}


/**
 * Send a transaction from the wallet.
 * @param {Object} params
 * @param {string|number|BigInt} params.amount - Amount in KAS to send.
 * @param {string|Object} params.toAddress - Destination address (string or Address object).
 * @param {string} [params.payload] - Optional payload string (will be hex encoded).
 * @param {string|number|BigInt} [params.priorityFeeKas] - Optional extra priority fee in KAS.
 * @returns {Promise<Object>} - The transaction result.
 */

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


/**
 * Get the spendable (mature) balance for the current wallet account.
 * @returns {Promise<BigInt>} - The spendable balance in sompi (BigInt).
 */

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


/**
 * Generate a new receiving or change address for the current account.
 * @param {boolean} [change=false] - If true, generate a change address; otherwise, receiving address.
 * @returns {Promise<string>} - The new address as a string.
 */

export async function generateNewAddress(change = false) {   
  const addr = await wallet.accountsCreateNewAddress({  
    accountId: accountId,  
    networkId: wallet.networkId,
    addressKind: change ? "change" : "receive"  
  });
  return addr.address;
}


/**
 * Generate a new keypair for the given index using the wallet's XPrv.
 * @param {number} index - The child index for key derivation.
 * @returns {Promise<{privateKey: string, publicKey: string}>} - The derived keypair.
 */

export async function generateNewKeypair(index) {
  const xprv = await utilities.getXPrvFromStorage(filename, walletSecret);
  const xprvHex = xprv.toString();
  const derivedKeyPair = await utilities.deriveReceivingChildKeyPair({xprvHex, index});
  return {
    privateKey: derivedKeyPair.privateKey,
    publicKey: derivedKeyPair.publicKey
  };
}


/**
 * Delete wallet data from IndexedDB by filename
 * @param {string} filename - key for the stored wallet
 * @returns {Promise<void>} Resolves when deletion is complete
 */
export async function deleteWalletData(filename) {
  // 1. Remove localStorage entries
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.includes(filename)) {
      localStorage.removeItem(key);
    }
  }

  // 2. Delete IndexedDB database used by Kaspa WASM
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase("kaspa_wallet_db");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Delete blocked"));
  });
}


/**
 * Get a list of all wallet files/descriptors available.
 * @returns {Promise<Array>} Array of wallet descriptors (each has filename, title, etc.)
 */
export async function getAllWallets() {
  if (!wallet) {
    throw new Error("Wallet not initialized. Call init() first.");
  }
  try {
    const result = await wallet.walletEnumerate({});
    return result.walletDescriptors || [];
  } catch (err) {
    throw new Error("Failed to enumerate wallets: " + (err && err.message ? err.message : err));
  }
}


/**
 * Get the mnemonic phrase from storage for the given wallet filename and password.
 * @param {string} filename - Wallet filename.
 * @param {string} password - Password to decrypt wallet data.
 * @returns {Promise<string>} - The mnemonic phrase.
 */
export async function getMnemonic({ theFilename = '', password = '' } = {}) {
  if(theFilename.length === 0) {
    theFilename = filename;
  }
  if(password.length === 0) {
    password = walletSecret;
  }
  return await utilities.getMnemonicFromStorage(theFilename, password);
}