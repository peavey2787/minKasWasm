> ### 📍 Navigation
> * [🏠 Project Hub](../README.md)
> * [🔍 Intelligence Guide](./intelligence/README.md)
> * [🔍 Low Level Guide](./LOW_LEVEL_SDK.md)
> * [📡 KKTP Protocol](../kktp/protocol/KKTP_PROTOCOL.md)
> * [🛡️ Anti-Cheat Demo](../demos/anti-cheat/README.md)

---

# KaspaPortal Framework — Facade Guide

## Introduction
The **KaspaPortal Framework** applies the **Facade Pattern** to provide a single, developer‑friendly entry point for Kaspa operations. Instead of wiring multiple low‑level components, you interact with one global facade (`kaspaPortal`) that **orchestrates transport, identity, intelligence, crypto, VRF, and KKTP**.

This guide focuses on the high‑level system only. The low‑level WASM SDK is documented separately: [**./LOW_LEVEL_SDK.md**](./wrapper/LOW_LEVEL_SDK.md).

---

## Global Portal (KaspaPortal)
**Responsibility:** Orchestrates all sub‑facades and exposes a unified API.

### Quick Start — Connect + Create Wallet
```js
import { kaspaPortal as portal } from './wrapper/kaspaPortal.js';

await portal.init();
await portal.connect({
  networkId: 'testnet-10',
  rpcUrl: null, // use public resolver
});

const wallet = await portal.createOrOpenWallet({
  password: 'your-password',
  filename: 'demo.wallet',
  storeMnemonic: false,
});

console.log('Wallet address:', wallet.address);
```

---

## Client Facade (Transport)
**Responsibility:** RPC connectivity and transaction submission.

### Key Methods
| Method | Description | Returns |
|---|---|---|
| `connect(rpcUrl, networkId, options)` | Connects to a Kaspa node | `Promise<client>` |
| `disconnect()` | Disconnects from the node | `Promise<void>` |
| `runRpcCommand(cmd)` | Executes raw RPC command | `Promise<any>` |
| `buildSignSubmitTransaction(args)` | Builds, signs, and submits a tx | `Promise<any>` |

### Quick Start
```js
const info = await portal.runRpcCommand({ method: 'getInfo', params: [] });
console.log(info);
```

---

## Wallet Facade (Identity)
**Responsibility:** Wallet lifecycle, addresses, balances, and sending funds.

### Key Methods
| Method | Description | Returns |
|---|---|---|
| `createOrOpenWallet(options)` | Create or open a wallet | `Promise<{address, mnemonic?}>` |
| `getBalance()` | Spendable balance | `Promise<bigint>` |
| `generateNewAddress()` | New receiving address | `Promise<string>` |
| `send(options)` | Sends a transaction | `Promise<any>` |

### Quick Start
```js
const { address } = await portal.createOrOpenWallet({
  password: 'pw',
  filename: 'demo.wallet',
});

const balance = await portal.getBalance();
console.log('Balance:', balance.toString());
```

---

## Scanner Facade (Intelligence)
**Responsibility:** Live scanning of blocks/transactions with prefix matching.

### Key Methods
| Method | Description | Returns |
|---|---|---|
| `setScannerPrefix(prefix)` | Set payload prefix matcher | `void` |
| `setSearchMode(mode)` | Sets match mode | `void` |
| `startScanner(onBlock)` | Start live block scan | `Promise<void>` |
| `stopScanner()` | Stop scanning | `void` |

### Quick Start — Scan for Prefix
```js
portal.setScannerPrefix('KKTP');
portal.setSearchMode(SearchMode.STARTS_WITH);

await portal.startScanner((block) => {
  console.log('New block:', block.hash);
});
```

---

## Indexer Facade (Intelligence)
**Responsibility:** Caching, indexing, and querying matching transactions.

### Key Methods
| Method | Description | Returns |
|---|---|---|
| `startIndexer()` | Starts indexer | `Promise<void>` |
| `stopIndexer()` | Stops indexer | `void` |
| `getAllMatchingTransactions()` | In‑memory matches | `Array` |
| `getAllCachedMatchingTransactions()` | Cached matches | `Promise<Array>` |
| `clearIndexerStore(storeName)` | Clear cache store | `Promise<void>` |

### Quick Start — Read Matches
```js
await portal.startIndexer();
const matches = portal.getAllMatchingTransactions();
console.log('Matches:', matches.length);
```

---

## Crypto Facade
**Responsibility:** Encryption, signatures, and key derivation.

### Key Methods
| Method | Description | Returns |
|---|---|---|
| `encrypt(text, password)` | Encrypts text | `string` |
| `decrypt(ciphertext, password)` | Decrypts text | `string` |
| `generateIdentityKeys(index)` | Derives signing + DH keys | `Promise<{sig, dh}>` |
| `signMessage(privateKeyHex, body)` | Signs message | `Promise<string>` |
| `verifyMessage(publicKey, body, sig)` | Verifies signature | `Promise<boolean>` |

### Quick Start
```js
const { sig } = await portal.generateIdentityKeys(0);
const body = 'hello';
const signature = await portal.signMessage(sig.privateKey, body);
const ok = await portal.verifyMessage(sig.publicKey, body, signature);
console.log('Verified:', ok);
```

---

## VRF Facade
**Responsibility:** Verifiable randomness and proof bundles.

### Key Methods
| Method | Description | Returns |
|---|---|---|
| `prove(options)` | Builds VRF proof bundle | `Promise<Object>` |
| `verify(valueOrResult, proof)` | Verifies VRF result | `Promise<boolean>` |
| `fetchBlocks(source, n)` | Fetch randomness blocks | `Promise<Object>` |
| `fullNIST(bits)` | Run NIST SP 800‑22 | `Promise<Array>` |

[!TIP] Statistical Rigor: The fullNIST method implements the NIST SP 800-22 statistical test suite, allowing developers to verify the entropy quality of the Kaspa-derived seeds against industry-standard randomness requirements.

### Quick Start
```js
const result = await portal.prove({ seedInput: 'kktp-seed' });
const valid = await portal.verify(result);
console.log('VRF verified:', valid);
```

---

## KKTP Facade
**Responsibility:** High‑level KKTP session orchestration and message flow.

### Key Methods
| Method | Description | Returns |
|---|---|---|
| `broadcastDiscovery(meta, options)` | Publish discovery anchor | `Promise<{discovery, payload}>` |
| `connectToPeer(discovery, options)` | Respond + establish | `Promise<{response, mailboxId}>` |
| `sendMessage(mailboxId, plaintext, options)` | Encrypt + publish | `Promise<{payload}>` |
| `processIncomingPayload(rawPayload)` | Parse + process | `Promise<Object|null>` |
| `getSessions()` | Active sessions | `Array<Object>` |

### Quick Start
```js
const { discovery } = await portal.broadcastDiscovery({ game: 'demo' });
// Responder uses discovery to connect:
// const { mailboxId } = await portal.connectToPeer(discovery);
```

---

## Interaction Flow (How the Facades Work Together)
- **Transport** connects to the Kaspa network and provides the RPC client.
- **Identity** manages wallets, addresses, balances, and transaction signing.
- **Intelligence** runs the **Scanner** to detect payloads and the **Indexer** to cache and query them.
- **Crypto** provides keys and signatures that KKTP relies on.
- **VRF** supplies public randomness used in KKTP session binding (anti‑MITM and auditability).
- **KKTP** orchestrates discovery, response, session establishment, and encrypted message flow.

Together, these layers enable **auditable, serverless protocols** such as the Anti‑Cheat demo, where **VRF + KKTP** provide verifiable randomness and secure message ordering.

---

## Design Philosophy
This framework sits **above** the low‑level WASM SDK (see **./LOW_LEVEL_SDK.md**) to provide **developer‑first ergonomics** while keeping access to raw power. The result is a clean, consistent API surface that reduces boilerplate and accelerates implementation of production‑grade Kaspa apps.

---

## File Reference
- Global facade: [wrapper/kaspaPortal.js](wrapper/kaspaPortal.js)
- Component facades:
  - [wrapper/transport/transportFacade.js](wrapper/transport/transportFacade.js)
  - [wrapper/identity/identityFacade.js](wrapper/identity/identityFacade.js)
  - [wrapper/intelligence/intelligenceFacade.js](wrapper/intelligence/intelligenceFacade.js)
  - [wrapper/crypto/cryptoFacade.js](wrapper/crypto/cryptoFacade.js)
  - [wrapper/vrf/vrfFacade.js](wrapper/vrf/vrfFacade.js)
- KKTP Protocol: [kktp/protocol/kktpProtocol.js](kktp/protocol/kktpProtocol.js)
