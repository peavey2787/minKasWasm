export const demoState = {
  // Connection
  connected: false,
  networkId: 'testnet-10',
  nodeUrl: null,
  client: null,

  // Wallet
  walletReady: false,
  walletFilename: 'rapid_tx_demo',
  walletReceiveAddress: null,
  walletChangeAddress: null,
  walletBalanceMatureKas: null,

  // UTXOs
  utxos: [], // normalized entries
  utxoStats: null,

  // Selection
  selectedOutpoints: new Set(),
  selectedEntries: [],
  selectedSumSompi: 0n,

  // Build
  pendingTx: null,
  pendingTxJson: null,
  pendingTxSummary: null,

  // Sign
  derivedKeys: null, // { receive, change }
  signed: false,

  // Submit
  submitRes: null,
  txid: null,

  // Session
  session: {
    events: [],
  },
};

export function resetTxFlowState() {
  demoState.utxos = [];
  demoState.utxoStats = null;

  demoState.selectedOutpoints.clear();
  demoState.selectedEntries = [];
  demoState.selectedSumSompi = 0n;

  demoState.pendingTx = null;
  demoState.pendingTxJson = null;
  demoState.pendingTxSummary = null;

  demoState.derivedKeys = null;
  demoState.signed = false;

  demoState.submitRes = null;
  demoState.txid = null;
}
