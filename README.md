# Kaspa WASM JS Wrapper & Demos

This project provides a browser-based Kaspa WASM SDK wrapper and a set of interactive demos. See below for how to use the wrapper modules in your own app.

## How to Use the Kaspa JS Wrapper

1. **Connect to a Kaspa node:**

	```js
	import { connect } from './wrapper/kaspa_client.js';

	const client = await connect(rpcUrl, networkId, { onDisconnect });
	// rpcUrl: Node address (or null for resolver)
	// networkId: e.g. "mainnet", "testnet-10"
	// onDisconnect: Optional callback for disconnect events
	```

2. **Initialize the wallet:**

	```js
	import { init } from './wrapper/wallet_service.js';

	init({ rpcClient: client, networkId, balanceElementId, onBalanceChange });
	// rpcClient: The connected Kaspa client
	// networkId: Network string
	// balanceElementId: (optional) DOM element ID to update balance
	// onBalanceChange: (optional) callback for balance updates
	```

3. **Create a wallet:**

	```js
	import { createWallet } from './wrapper/wallet_service.js';

	const { mnemonic, address } = await createWallet({
	  password,
	  filename,
	  userHint,
	  mnemonic,
	  storeMnemonic
	});
	```

4. **Send Kaspa:**

	```js
	import { send } from './wrapper/wallet_service.js';

	await send({ amount, toAddress, payload, priorityFeeKas });
	```

5. **Other wallet functions:**

	```js
	import { getSpendableBalance, generateNewAddress, generateNewKeypair } from './wrapper/wallet_service.js';

	const balance = await getSpendableBalance();
	const address = await generateNewAddress();
	const keypair = await generateNewKeypair(index);
	```

6. **Block Scanner usage:**

	```js
	import { KaspaBlockScanner, SearchMode } from './wrapper/scanner.js';

	const scanner = new KaspaBlockScanner(client);
	scanner.setSearch(searchString, SearchMode.INCLUDES);
	await scanner.start((block, match, matchedPayload) => {
	  // handle block
	});
	scanner.stop();
	```

7. **Run arbitrary RPC commands:**

	```js
	import { runRpcCommand } from './wrapper/rpc_runner.js';

	const result = await runRpcCommand(client, '{"method":"getInfo","params":{}}');
	```
  
8. **Symmetric Encryption usage:**

	```js
	import { encryptMessage, decryptMessage } from './wrapper/encryption.js';

	// Encrypt
	const encrypted = encryptMessage(plaintext, password);

	// Decrypt
	const decrypted = decryptMessage(encrypted, password);
	```

9. **Diffie–Hellman Encryption usage:**

	```js
	import { DHSession } from './wrapper/dh_encryption.js';

	const dh = new DHSession();
	// Initiate handshake
	const handshakeMsg = dh.initiateHandshake(myPrivateKey, myPublicKey);
	// Respond to handshake
	const response = await dh.respondToHandshake(peerPublicKeyHex);
	// Encrypt
	const encrypted = dh.encrypt(message);
	// Decrypt
	const decrypted = dh.decrypt(encrypted);
	```