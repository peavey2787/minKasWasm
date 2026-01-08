// kaspa_client.js
import initKaspa, { RpcClient, Resolver, ConnectStrategy } from './kas-wasm/kaspa.js'; 
// Either 1. ensure you put the actual Kaspa WASM SDK in a folder named "kas-wasm" outside of the folder this file is in, or 2. point to where you have it 

let client = null;
let wasmInitialized = false;
let currentRpcUrl = null;
let currentNetworkId = null;
let reconnecting = false;

export async function connect(rpcUrl, networkId = "testnet-10", { onDisconnect } = {}) {
  // Initialize Kaspa wasm sdk once
  if (!wasmInitialized) {
    await initKaspa();
    wasmInitialized = true;
  }

  // 1. Shut down existing client
  if (client) {
    try {
      await client.disconnect();
    } catch (e) {
      console.warn("Cleanup error:", e);
    }
    client = null;
  }

  // Store connection details for reconnect
  currentRpcUrl = rpcUrl;
  currentNetworkId = networkId;

  // 2. Set options
  const options = {
    networkId: networkId,
    resolver: rpcUrl ? undefined : new Resolver(),
    url: rpcUrl || undefined
  };

  const newClient = new RpcClient(options);

  const connectOptions = { 
    blockAsyncConnect: true,
    retryInterval: 2000, // retry every 2s if needed
    strategy: ConnectStrategy.Persistent,
    timeoutDuration: 10000 // fail after 10s
  };
  
  // 3. Connect
  try {
    await newClient.connect(connectOptions);
  } catch (err) {
    console.error("Connect failed:", err);
    throw err;
  }

  // Assign to singleton AFTER successful connection
  client = newClient;

  // Subscribe to disconnect event for auto-reconnect
  if (client && typeof client.on === 'function') {
    client.on('disconnect', async () => {
      if (reconnecting) return;
      reconnecting = true;
      if (onDisconnect) onDisconnect();
      try {
        client = await connect(currentRpcUrl, currentNetworkId, { onDisconnect });
        reconnecting = false;
      } catch (err) {
        reconnecting = false;
        // Optionally, emit a global event or log error
        throw err;
      }
    });
  }
  return client;
}