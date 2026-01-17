# Kaspa WASM JS Wrapper & Demos

This project provides a browser-based Kaspa WASM SDK wrapper and a set of interactive demos. See below for how to use the wrapper modules in your own app.

## Demos

- Block scanner + wallet + indexer UI: `demos/scanner/scanner.html`
- DAG walking UI (powered by `wrapper/dag_walk.js`): `demos/dag-walk/dag_walk.html`

## How to Use the Kaspa JS Wrapper

### Client

1. **Connect to a Kaspa node:**

	```js
	import { connect } from './wrapper/kaspa_client.js';

	const client = await connect(rpcUrl, networkId, { onDisconnect });
	// rpcUrl: Node address (or null for resolver)
	// networkId: e.g. "mainnet", "testnet-10"
	// onDisconnect: Optional callback for disconnect events
	```

### Wallet Management

2. **Initialize the wallet:**

	```js
	import { init } from './wrapper/wallet_service.js';

	init({ rpcClient: client, networkId, balanceElementId, onBalanceChange });
	// rpcClient: The connected Kaspa client
	// networkId: Network string
	// balanceElementId: (optional) DOM element ID to update balance
	// onBalanceChange: (optional) callback for balance updates
	```

3. **Create/Import a wallet:**

	```js
	import { createWallet } from './wrapper/wallet_service.js';

	const { mnemonic, address } = await createWallet({
	  password,             // Wallet password
	  filename,             // (optional) Wallet filename
	  userHint,             // (optional) User hint for wallet
	  mnemonic,             // (optional) Import mnemonic
	  storeMnemonic,        // (optional) Store mnemonic in storage
	  discoverAddresses     // (optional, default true) Scan for used addresses
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

### Wallet File Management

6. **List all wallets:**

	```js
	import { getAllWallets } from './wrapper/wallet_service.js';

	const wallets = await getAllWallets();
	// wallets: Array of { filename, title, ... }
	```

7. **Delete a wallet by filename:**

	```js
	import { deleteWalletData } from './wrapper/storage.js';

	await deleteWalletData(filename); // filename: string
	```

### Block Scanner

8. **Block Scanner usage:**

	```js
	import { KaspaBlockScanner, SearchMode } from './wrapper/scanner.js';
	import { MatchMode } from './wrapper/indexer.js';

	// The scanner is coupled with an internal indexer at scanner.indexer
	const scanner = new KaspaBlockScanner(client, {
	  prefix: 'test',
	  mode: SearchMode.INCLUDES,
	  indexerOptions: {
	    ttlMinutes: 10,
	    flushInterval: 5000,
	    maxSize: 500,
	    matchMode: MatchMode.ALL,
	    onIndexerUpdate: (event) => {
	      // stream indexer events into your UI
	      // NOTE: *-cached events are batched per flush: event.data is an array.
	      // In-memory events provide a single entry.
	    }
	  }
	});

	// Start indexing when you want it (optional)
	scanner.indexer.start();

	await scanner.start((block, matches) => {
	  // block: full block object
	  // matches: array of match objects for this block
	});

	scanner.stop();
	scanner.indexer.stop();
	```

### Indexer (Standalone)

The indexer can also be used standalone (without the scanner). See `wrapper/README.md`.

### Walking the DAG

The DAG walker utilities live in `wrapper/dag_walk.js`.

```js
import { walkDagToPresent, scanDagForward, scanDagBackward } from './wrapper/dag_walk.js';

await walkDagToPresent({
  client,
  startHash,
  maxSeconds: 10,
  minTimestamp: 0,
  logFn: console.log,
  onBlock: (block) => false
});

const forwardMatch = await scanDagForward({
  client,
  startHash,
  searchText: 'hello',
  matchMode: 'contains', // exact | prefix | contains | cleaned_contains
  maxSeconds: 15,
  minTimestamp: 0,
  logFn: console.log
});

const backwardMatch = await scanDagBackward({
  client,
  startHash,
  maxSeconds: 15,
  maxDepth: 5000, // optional safety limit (or Infinity)
  logFn: console.log,
  matchFn: (block, tx) => false
});
```

## Testing

Browser-based test dashboard for the DAG walker:

- `tests/walking-the-dag/tests.html`

Included tests:

- `tests/walking-the-dag/test_walk_forward_to_present.js`
- `tests/walking-the-dag/test_walk_forward_to_match.js` (supports auto payload discovery when match input is blank)
- `tests/walking-the-dag/test_walk_backward_to_match.js` (supports auto payload discovery when match input is blank)

To run them, serve the repo via a local web server (e.g. Laragon) and open `tests/walking-the-dag/tests.html` in your browser.

### RPC Commands

9. **Run arbitrary RPC commands:**

	```js
	import { runRpcCommand } from './wrapper/rpc_runner.js';

	const result = await runRpcCommand(client, '{"method":"getInfo","params":{}}');
	```

### Encryption

10. **Symmetric Encryption usage:**

	```js
	import { encryptMessage, decryptMessage } from './wrapper/encryption.js';

	// Encrypt
	const encrypted = encryptMessage(plaintext, password);

	// Decrypt
	const decrypted = decryptMessage(encrypted, password);
	```

11. **Diffie–Hellman Encryption usage:**

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