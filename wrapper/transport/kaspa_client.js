// kaspa_client.js
import {
  RpcClient,
  Resolver,
  ConnectStrategy,
} from "../kas-wasm/kaspa.js";

let client = null;
let currentRpcUrl = null;
let currentNetworkId = null;

export async function connect({
  rpcUrl,
  networkId = "testnet-10",
  onDisconnect,
} = {}) {
  // 1. Shut down existing client
  if (client) {
    try {
      await client.disconnect();
      client.free(); // Many Rust-based WASM modules need this to release the "Heap"
      client = null; // Garbage Collect the JS reference
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
    url: rpcUrl || undefined,
  };

  const newClient = new RpcClient(options);

  const connectOptions = {
    blockAsyncConnect: false,
    retryInterval: 2000, // retry every 2s if needed
    strategy: ConnectStrategy.Persistent,
    timeoutDuration: 10000, // fail after 10s
  };

  // 3. Connect
  try {
    await newClient.connect(connectOptions);
  } catch (err) {
    console.error("Connect failed:", err);
    throw err;
  }

  // Assign to singleton after successful connection
  client = newClient;

  // Subscribe to disconnect event
  if (client && typeof client.on === "function") {
    client.on("disconnect", async () => {
      console.warn("Disconnected from Kaspa node");
      if (typeof onDisconnect === "function") {
        await onDisconnect();
      }
    });
  }

  if (rpcUrl) {
    console.log(
      `Connected to Kaspa node at ${rpcUrl} on network ${currentNetworkId}`,
    );
  } else {
    console.log(
      `Connected to public Kaspa node via resolver on network ${currentNetworkId}`,
    );
  }

  return client;
}
