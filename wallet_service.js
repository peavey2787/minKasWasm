// wallet_service.js
import { Wallet, Mnemonic } from './kas-wasm/kaspa.js';
let wallet = null;
let walletInitialized = false;
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

  return mnemonicPhrase;

}