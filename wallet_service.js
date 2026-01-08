// wallet_service.js
import { Wallet, Mnemonic } from './kas-wasm/kaspa.js';

let wallet = null;
let walletInitialized = false;
let walletSecret = null;

export function init(rpcClient, networkId) {
  if (walletInitialized) return;

  // 1. Construct wallet with proper options

  wallet = new Wallet({

    resident: false,

    networkId,

    resolver: rpcClient.resolver || undefined

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

  // 6. Create and activate account

  const account = await wallet.accountsCreate({

    prvKeyDataId: prvKey.prvKeyDataId,

    type: "bip32",

    walletSecret: password

  });
  
  await wallet.accountsActivate([account.accountDescriptor.accountId]);
  
  // 7. Derive first receive address

  await wallet.accountsCreateNewAddress({

    accountId: account.accountDescriptor.accountId,

    addressKind: "receive"

  });

  // 8. Connect and start wallet

  await wallet.connect();
  
  await wallet.start();

  // Return mnemonic for backup

  return {mnemonic:mnemonicPhrase, address: account.accountDescriptor.receiveAddress};

}

export async function send({ amount, toAddress, payload, priorityFeeKas }) {
 
  if (!walletInitialized || !wallet) {
    throw new Error("Wallet not initialized. Call init() first.");
  }

  // Get account
  const accounts = await wallet.accountsEnumerate({});
  if (!accounts.accountDescriptors?.length) {
    throw new AccountNotFoundError();
  }
  const firstAccount = accounts.accountDescriptors[0];

  // Determine priority fee:
  // - If custom fee provided: use it as extra priority fee on top of base network fee
  // - If no custom fee: use 0 (dust-floor / minimum required by network based on mass)
  // - Smallest amount I've seen send successfully is 0.000002 KAS without any payload
  let priorityFeeSompi = 0n;
  if(priorityFeeSompi > 0n) {
    priorityFeeSompi = kaspaToSompi(priorityFeeKas);
  }  

  // Check balance (use amount + priority fee; network will add base fee from mass)
  const spendable = await getSpendableBalance(firstAccount.accountId);
  const required = kaspaToSompi(amount) + priorityFeeSompi;
  if (spendable < required) {
    throw new Error(required.toString(), spendable.toString());
  }

  // Build request - priorityFeeSompi is extra fee on top of the base network fee
  const sendRequest = {
      walletSecret: walletSecret,
      accountId: firstAccount.accountId,
      priorityFeeSompi,
      destination: [{
        address: toAddress,
        amount: kaspaToSompi(amount)
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
    throw new TransactionError('Transaction failed', err);
  }
}

export async function getSpendableBalance(accountId) {

  const res = await wallet.accountsGet({ accountId });
  if (!res) return Number.MAX_SAFE_INTEGER;

  let bal = null;
  if (res.account?.balance) {
    bal = res.account.balance;
  } else if (res.accounts?.[0]?.balance) {
    bal = res.accounts[0].balance;
  }

  if (!bal) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(bal.mature || 0) + Number(bal.pending || 0);
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
