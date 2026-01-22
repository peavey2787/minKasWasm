# Kaspa Kinesis SDK

High-level TypeScript SDK for Kaspa applications. Connect, transact, observe payload events, and generate verifiable randomness — without understanding blockDAGs, UTXOs, or WASM internals.

## Installation

```bash
npm install @minkas/kinesis-sdk
```

## Quick Start

```ts
import {
  createClient,
  createWallet,
  createSender,
  createObserver,
  vrf,
} from '@minkas/kinesis-sdk';

// 1. Connect to Kaspa
const client = await createClient({ network: 'testnet-10' });

// 2. Create or open a wallet
const wallet = await createWallet({
  client,
  name: 'my-game-wallet',
  password: 'secret123',
});

console.log('Address:', wallet.address);
const balance = await wallet.getBalance();
console.log('Balance:', balance.matureKas, 'KAS');

// 3. Send transactions with payloads
const sender = createSender({ client, wallet, toAddress: wallet.address });

const result = await sender.send({
  amountKas: '0.5',
  payload: 'myapp:event:{"action":"move","x":10,"y":20}',
});
console.log('Sent:', result.txId);

// 4. Observe payload events
const observer = createObserver({
  client,
  filters: [{ prefix: 'myapp:event:' }],
});

observer.on('event', (e) => {
  console.log('Received event:', e.payloadParsed);
});

await observer.start();

// 5. Generate verifiable randomness
const kaspaEntropy = await vrf.fetchKaspaBlocks({ client, count: 100 });
const btcEntropy = await vrf.fetchBtcBlocks({ count: 6 });
const qrngEntropy = await vrf.fetchQrng({ bytes: 32 });

const vrfResult = await vrf.fold({
  kaspa: kaspaEntropy,
  btc: btcEntropy,
  qrng: qrngEntropy,
  iterations: 10000,
});

console.log('VRF Output:', vrfResult.outputHex);
```

## API Reference

### `createClient(options)`

Connect to a Kaspa node.

| Option     | Type        | Description                          |
| ---------- | ----------- | ------------------------------------ |
| `network`  | `NetworkId` | `'mainnet'`, `'testnet-10'`, etc.    |
| `rpcUrl?`  | `string`    | Direct RPC URL (optional)            |
| `logger?`  | `Logger`    | Custom logger (default: `console`)   |

### `createWallet(options)`

Create or open a wallet.

| Option     | Type            | Description           |
| ---------- | --------------- | --------------------- |
| `client`   | `KinesisClient` | Connected client      |
| `name`     | `string`        | Wallet storage name   |
| `password` | `string`        | Wallet password       |

### `createSender(options)`

Create a transaction sender.

| Option      | Type            | Description              |
| ----------- | --------------- | ------------------------ |
| `client`    | `KinesisClient` | Connected client         |
| `wallet`    | `KinesisWallet` | Wallet to send from      |
| `toAddress` | `string`        | Default recipient        |

### `createObserver(options)`

Observe blockchain events by payload prefix.

| Option    | Type              | Description                 |
| --------- | ----------------- | --------------------------- |
| `client`  | `KinesisClient`   | Connected client            |
| `filters` | `PayloadFilter[]` | Prefix filters to match     |

### VRF Module

```ts
import { vrf } from '@minkas/kinesis-sdk';

// Fetch entropy sources
const kaspa = await vrf.fetchKaspaBlocks({ client, count: 100 });
const btc = await vrf.fetchBtcBlocks({ count: 6 });
const qrng = await vrf.fetchQrng({ bytes: 32 });

// Fold into verifiable output
const result = await vrf.fold({ kaspa, btc, qrng, iterations: 10000 });
```

## Error Handling

```ts
import { KinesisError, KinesisErrorCode } from '@minkas/kinesis-sdk';

try {
  await sender.send({ amountKas: '1000', payload: 'test' });
} catch (e) {
  if (e instanceof KinesisError) {
    switch (e.code) {
      case KinesisErrorCode.INSUFFICIENT_FUNDS:
        console.log('Need more KAS!');
        break;
      case KinesisErrorCode.PAYLOAD_TOO_LARGE:
        console.log('Payload too big!');
        break;
      default:
        console.log('Error:', e.message);
    }
  }
}
```

## Building

```bash
npm install
npm run build
```

Build output is emitted to `dist/`:

- `dist/index.js` (browser ESM bundle)
- `dist/index.d.ts` (TypeScript typings)
- `dist/kaspa_bg.wasm` (Kaspa WASM binary, loaded by the bundle at runtime)

## License

MIT
