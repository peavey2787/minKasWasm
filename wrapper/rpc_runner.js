// rpc_runner.js
export async function runRpcCommand(client, cmdText) {
  if (!client || !client.isConnected) {
    return "Not connected to any RPC";
  }

  try {
    if (!cmdText) return "No command provided";
    const cmd = JSON.parse(cmdText);

    const methodName = cmd.method;
    const params = cmd.params || {};

    if (typeof client[methodName] !== "function") {
      return `Method ${methodName} not found on RpcClient`;
    }

    const result = await client[methodName](params);

    if (typeof result === "object") {
      return Object.entries(result)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
    } else {
      return String(result);
    }
  } catch (err) {
    console.error("[RpcRunner] Error running RPC command:", err);
    return "Error: " + err;
  }
}

