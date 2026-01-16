// dom_elements.js

// Element ID constants
export const DAGWALK_MIN_TIMESTAMP_INPUT_ID = "dagwalkMinTimestampInput";
export const DAGWALK_BLOCK_HASH_INPUT_ID = "dagwalkBlockHashInput";
export const DAGWALK_SEARCH_TEXT_INPUT_ID = "dagwalkSearchTextInput";
export const DAGWALK_MAX_BLOCKS_INPUT_ID = "dagwalkMaxBlocksInput";
export const DAGWALK_MATCH_MODE_SELECT_ID = "dagwalkMatchModeSelect";
export const DAGWALK_START_BTN_ID = "dagwalkStartBtn";
export const DAGWALK_RESULTS_ID = "dagwalkResults";
export const CONNECT_BTN_ID = "connectBtn";
export const NODE_INPUT_ID = "nodeInput";
export const NETWORK_INPUT_ID = "networkInput";
export const PUBLIC_RESOLVER_CHECKBOX_ID = "publicResolverCheckbox";
export const START_STOP_BTN_ID = "startStopBtn";
export const SEARCH_INPUT_ID = "searchInput";
export const BLOCKS_IFRAME_ID = "blocksIframe";
export const MATCHES_CONTAINER_ID = "matchesContainer";
export const STATUS_DIV_ID = "statusDiv";
export const CREATE_WALLET_BTN_ID = "createWalletBtn";
export const SEND_BTN_ID = "sendBtn";
export const TO_ADDRESS_INPUT_ID = "toAddressInput";
export const AMOUNT_INPUT_ID = "amountInput";
export const PAYLOAD_INPUT_ID = "payloadInput";
export const RECEIVE_ADDRESS_LABEL_ID = "receiveAddressLabel";
export const SEND_RESULT_LABEL_ID = "sendResult";
export const COPY_BTN_ID = "copyReceiveAddressBtn";
export const INDEXER_MATCHING_TXS_DIV_ID = "indexerMatchingTxs";
export const INDEXER_ALL_TXS_DIV_ID = "indexerAllTxs";
export const INDEXER_BLOCKS_DIV_ID = "indexerBlocks";
export const CLEAR_MATCHING_TXS_BTN_ID = "clearMatchingTxsBtn";
export const CLEAR_ALL_TXS_BTN_ID = "clearAllTxsBtn";
export const CLEAR_BLOCKS_BTN_ID = "clearBlocksBtn";
export const STOP_INDEXER_BTN_ID = "stopIndexerBtn";
export const MATCH_MODE_SELECT_ID = "indexerMatchMode";
export const CUSTOM_MODE_OPTIONS_ID = "customModeOptions";
export const INDEX_ALL_TRANSACTIONS_ID = "indexAllTransactions";
export const INDEX_ALL_MATCHING_TRANSACTIONS_ID = "indexAllMatchingTransactions";
export const INDEX_ALL_BLOCKS_ID = "indexAllBlocks";
export const INDEXER_COUNTDOWN_DIV_ID = "indexerCountdown";
export const INDEXER_PRIORITY_RADIOS_NAME = "indexerPriority";
export const INDEXER_TTL_INPUT_ID = "indexerTtlInput";
export const INDEXER_MAX_SIZE_INPUT_ID = "indexerMaxSizeInput";
export const START_INDEXER_BTN_ID = "startIndexerBtn";
export const TOGGLE_IN_MEMORY_BTN_ID = "toggleInMemoryBtn";
export const TOGGLE_CACHED_BTN_ID = "toggleCachedBtn";
export const IN_MEMORY_SECTIONS_ID = "inMemorySections";
export const CACHED_SECTIONS_ID = "cachedSections";
export const IN_MEMORY_MATCHING_TXS_ID = "inMemoryMatchingTxs";
export const IN_MEMORY_ALL_TXS_ID = "inMemoryAllTxs";
export const IN_MEMORY_BLOCKS_ID = "inMemoryBlocks";
export const FLUSH_INTERVAL_INPUT_ID = "flushIntervalInput";
export const IN_MEMORY_MATCHING_TXS_INFO_BAR_ID = "inMemoryMatchingTxsInfoBar";
export const IN_MEMORY_ALL_TXS_INFO_BAR_ID = "inMemoryAllTxsInfoBar";
export const IN_MEMORY_BLOCKS_INFO_BAR_ID = "inMemoryBlocksInfoBar";
export const INDEXER_MATCHING_TXS_INFO_BAR_ID = "indexerMatchingTxsInfoBar";
export const INDEXER_ALL_TXS_INFO_BAR_ID = "indexerAllTxsInfoBar";
export const INDEXER_BLOCKS_INFO_BAR_ID = "indexerBlocksInfoBar";
export const INDEXER_FLUSH_COUNTDOWN_ID = "flushCountdown";
export const DAGWALK_MODE_RADIOS_NAME = "dagwalkMode";

// Getter functions
export function getDagwalkMinTimestampInput() { return document.getElementById(DAGWALK_MIN_TIMESTAMP_INPUT_ID); }
export function getDagwalkBlockHashInput() { return document.getElementById(DAGWALK_BLOCK_HASH_INPUT_ID); }
export function getDagwalkSearchTextInput() { return document.getElementById(DAGWALK_SEARCH_TEXT_INPUT_ID); }
export function getDagwalkMaxBlocksInput() { return document.getElementById(DAGWALK_MAX_BLOCKS_INPUT_ID); }
export function getDagwalkMatchModeSelect() { return document.getElementById(DAGWALK_MATCH_MODE_SELECT_ID); }
export function getDagwalkStartBtn() { return document.getElementById(DAGWALK_START_BTN_ID); }
export function getDagwalkResultsDiv() { return document.getElementById(DAGWALK_RESULTS_ID); }
export function getConnectBtn() { return document.getElementById(CONNECT_BTN_ID); }
export function getNodeInput() { return document.getElementById(NODE_INPUT_ID); }
export function getNetworkInput() { return document.getElementById(NETWORK_INPUT_ID); }
export function getPublicResolverCheckbox() { return document.getElementById(PUBLIC_RESOLVER_CHECKBOX_ID); }
export function getStartStopBtn() { return document.getElementById(START_STOP_BTN_ID); }
export function getSearchInput() { return document.getElementById(SEARCH_INPUT_ID); }
export function getBlocksIframe() { return document.getElementById(BLOCKS_IFRAME_ID); }
export function getMatchesContainer() { return document.getElementById(MATCHES_CONTAINER_ID); }
export function getStatusDiv() { return document.getElementById(STATUS_DIV_ID); }
export function getCreateWalletBtn() { return document.getElementById(CREATE_WALLET_BTN_ID); }
export function getSendBtn() { return document.getElementById(SEND_BTN_ID); }
export function getToAddressInput() { return document.getElementById(TO_ADDRESS_INPUT_ID); }
export function getAmountInput() { return document.getElementById(AMOUNT_INPUT_ID); }
export function getPayloadInput() { return document.getElementById(PAYLOAD_INPUT_ID); }
export function getReceiveAddressLabel() { return document.getElementById(RECEIVE_ADDRESS_LABEL_ID); }
export function getSendResultLabel() { return document.getElementById(SEND_RESULT_LABEL_ID); }
export function getCopyBtn() { return document.getElementById(COPY_BTN_ID); }
export function getIndexerMatchingTxsDiv() { return document.getElementById(INDEXER_MATCHING_TXS_DIV_ID); }
export function getIndexerAllTxsDiv() { return document.getElementById(INDEXER_ALL_TXS_DIV_ID); }
export function getIndexerBlocksDiv() { return document.getElementById(INDEXER_BLOCKS_DIV_ID); }
export function getClearMatchingTxsBtn() { return document.getElementById(CLEAR_MATCHING_TXS_BTN_ID); }
export function getClearAllTxsBtn() { return document.getElementById(CLEAR_ALL_TXS_BTN_ID); }
export function getClearBlocksBtn() { return document.getElementById(CLEAR_BLOCKS_BTN_ID); }
export function getStopIndexerBtn() { return document.getElementById(STOP_INDEXER_BTN_ID); }
export function getMatchModeSelect() { return document.getElementById(MATCH_MODE_SELECT_ID); }
export function getCustomModeOptions() { return document.getElementById(CUSTOM_MODE_OPTIONS_ID); }
export function getIndexAllTransactionsCheckbox() { return document.getElementById(INDEX_ALL_TRANSACTIONS_ID); }
export function getIndexAllMatchingTransactionsCheckbox() { return document.getElementById(INDEX_ALL_MATCHING_TRANSACTIONS_ID); }
export function getIndexAllBlocksCheckbox() { return document.getElementById(INDEX_ALL_BLOCKS_ID); }
export function getIndexerCountdownDiv() { return document.getElementById(INDEXER_COUNTDOWN_DIV_ID); }
export function getIndexerPriorityRadios() { return document.getElementsByName(INDEXER_PRIORITY_RADIOS_NAME); }
export function getTtlInput() { return document.getElementById(INDEXER_TTL_INPUT_ID); }
export function getMaxSizeInput() { return document.getElementById(INDEXER_MAX_SIZE_INPUT_ID); }
export function getStartIndexerBtn() { return document.getElementById(START_INDEXER_BTN_ID); }
export function getToggleInMemoryBtn() { return document.getElementById(TOGGLE_IN_MEMORY_BTN_ID); }
export function getToggleCachedBtn() { return document.getElementById(TOGGLE_CACHED_BTN_ID); }
export function getInMemorySections() { return document.getElementById(IN_MEMORY_SECTIONS_ID); }
export function getCachedSections() { return document.getElementById(CACHED_SECTIONS_ID); }
export function getInMemoryMatchingTxsDiv() { return document.getElementById(IN_MEMORY_MATCHING_TXS_ID); }
export function getInMemoryAllTxsDiv() { return document.getElementById(IN_MEMORY_ALL_TXS_ID); }
export function getInMemoryBlocksDiv() { return document.getElementById(IN_MEMORY_BLOCKS_ID); }
export function getFlushIntervalInput() { return document.getElementById(FLUSH_INTERVAL_INPUT_ID); }
export function getInMemoryMatchingTxsInfoBar() { return document.getElementById(IN_MEMORY_MATCHING_TXS_INFO_BAR_ID); }
export function getInMemoryAllTxsInfoBar() { return document.getElementById(IN_MEMORY_ALL_TXS_INFO_BAR_ID); }
export function getInMemoryBlocksInfoBar() { return document.getElementById(IN_MEMORY_BLOCKS_INFO_BAR_ID); }
export function getIndexerMatchingTxsInfoBar() { return document.getElementById(INDEXER_MATCHING_TXS_INFO_BAR_ID); }
export function getIndexerAllTxsInfoBar() { return document.getElementById(INDEXER_ALL_TXS_INFO_BAR_ID); }
export function getIndexerBlocksInfoBar() { return document.getElementById(INDEXER_BLOCKS_INFO_BAR_ID); }
export function getIndexerFlushCountdownDiv() { return document.getElementById(INDEXER_FLUSH_COUNTDOWN_ID); }
export function getDagwalkModeRadios() { return document.getElementsByName(DAGWALK_MODE_RADIOS_NAME); }