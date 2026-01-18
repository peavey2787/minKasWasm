// dom_elements.js - Element IDs and getters for anti-cheat demo

// Connection
export const CONNECTION_STATUS_ID = 'connectionStatus';
export const NETWORK_SELECT_ID = 'networkSelect';
export const USE_PUBLIC_RESOLVER_ID = 'usePublicResolver';
export const NODE_URL_ID = 'nodeUrl';
export const CONNECT_BTN_ID = 'connectBtn';

// VRF Sources
export const KASPA_BLOCK_COUNT_ID = 'kaspaBlockCount';
export const BTC_BLOCK_COUNT_ID = 'btcBlockCount';
export const QRNG_BYTES_ID = 'qrngBytes';
export const QRNG_INPUT_ID = 'qrngInput';
export const FETCH_KASPA_BTN_ID = 'fetchKaspaBtn';
export const FETCH_BTC_BTN_ID = 'fetchBtcBtn';
export const FETCH_QRNG_BTN_ID = 'fetchQrngBtn';
export const FETCH_ALL_BTN_ID = 'fetchAllBtn';
export const KASPA_BLOCKS_PANEL_ID = 'kaspaBlocksPanel';
export const BTC_BLOCKS_PANEL_ID = 'btcBlocksPanel';
export const QRNG_PANEL_ID = 'qrngPanel';
export const KASPA_BLOCK_COUNT_LABEL_ID = 'kaspaBlockCountLabel';
export const BTC_BLOCK_COUNT_LABEL_ID = 'btcBlockCountLabel';
export const QRNG_DATA_LABEL_ID = 'qrngDataLabel';
export const EXPORT_KASPA_BTN_ID = 'exportKaspaBtn';
export const EXPORT_BTC_BTN_ID = 'exportBtcBtn';
export const EXPORT_QRNG_BTN_ID = 'exportQrngBtn';

// Folding
export const FOLD_KASPA_ID = 'foldKaspa';
export const FOLD_BTC_ID = 'foldBtc';
export const FOLD_QRNG_ID = 'foldQrng';
export const FOLD_ITERATIONS_ID = 'foldIterations';
export const FOLD_BTN_ID = 'foldBtn';
export const FOLDED_OUTPUT_PANEL_ID = 'foldedOutputPanel';
export const EXPORT_FOLDED_BTN_ID = 'exportFoldedBtn';

// NIST
export const NIST_SOURCE_ID = 'nistSource';
export const RUN_NIST_BTN_ID = 'runNistBtn';
export const NIST_PROGRESS_ID = 'nistProgress';
export const NIST_RESULTS_BODY_ID = 'nistResultsBody';
export const EXPORT_NIST_BTN_ID = 'exportNistBtn';

// Player
export const PLAYER_STATUS_ID = 'playerStatus';
export const ANCHOR_INTERVAL_ID = 'anchorInterval';
export const PAYLOAD_PREFIX_ID = 'payloadPrefix';
export const START_PLAYER_BTN_ID = 'startPlayerBtn';
export const STOP_PLAYER_BTN_ID = 'stopPlayerBtn';
export const PLAYER_GRID_ID = 'playerGrid';
export const MOVE_LOG_PANEL_ID = 'moveLogPanel';
export const MERKLE_TREE_PANEL_ID = 'merkleTreePanel';
export const ANCHOR_TX_PANEL_ID = 'anchorTxPanel';

// Spectator
export const SPECTATOR_STATUS_ID = 'spectatorStatus';
export const SPECTATOR_PREFIX_ID = 'spectatorPrefix';
export const START_SPECTATOR_BTN_ID = 'startSpectatorBtn';
export const STOP_SPECTATOR_BTN_ID = 'stopSpectatorBtn';
export const SPECTATOR_GRID_ID = 'spectatorGrid';
export const SPECTATOR_LOG_PANEL_ID = 'spectatorLogPanel';
export const SPECTATOR_MOVE_PANEL_ID = 'spectatorMovePanel';
export const SPECTATOR_VERIFY_PANEL_ID = 'spectatorVerifyPanel';

// Generic getter
export const $ = (id) => document.getElementById(id);
export const $$ = (sel) => document.querySelectorAll(sel);

// Getters
export function getConnectionStatus() { return $(CONNECTION_STATUS_ID); }
export function getNetworkSelect() { return $(NETWORK_SELECT_ID); }
export function getUsePublicResolver() { return $(USE_PUBLIC_RESOLVER_ID); }
export function getNodeUrl() { return $(NODE_URL_ID); }
export function getConnectBtn() { return $(CONNECT_BTN_ID); }
export function getKaspaBlockCountInput() { return $(KASPA_BLOCK_COUNT_ID); }
export function getBtcBlockCountInput() { return $(BTC_BLOCK_COUNT_ID); }
export function getQrngBytesInput() { return $(QRNG_BYTES_ID); }
export function getQrngInput() { return $(QRNG_INPUT_ID); }
export function getPlayerGrid() { return $(PLAYER_GRID_ID); }
export function getSpectatorGrid() { return $(SPECTATOR_GRID_ID); }
