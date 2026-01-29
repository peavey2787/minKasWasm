// dom_elements.js

// Connection
export const PUBLIC_RESOLVER_CHECKBOX_ID = 'publicResolverCheckbox';
export const NODE_INPUT_ID = 'nodeInput';
export const NETWORK_INPUT_ID = 'networkInput';
export const CONNECT_BTN_ID = 'connectBtn';
export const STATUS_DIV_ID = 'statusDiv';

// Walk options
export const MODE_SELECT_ID = 'modeSelect';
export const START_HASH_INPUT_ID = 'startHashInput';
export const MAX_SECONDS_INPUT_ID = 'maxSecondsInput';
export const MIN_TIMESTAMP_INPUT_ID = 'minTimestampInput';
export const PREFIXES_INPUT_ID = 'prefixesInput';

// Forward
export const FORWARD_OPTIONS_ID = 'forwardOptions';
export const SEARCH_TEXT_INPUT_ID = 'searchTextInput';
export const MATCH_MODE_SELECT_ID = 'matchModeSelect';

// Backward
export const BACKWARD_OPTIONS_ID = 'backwardOptions';
export const BACKWARD_TARGET_TYPE_SELECT_ID = 'backwardTargetTypeSelect';
export const BACKWARD_TARGET_VALUE_INPUT_ID = 'backwardTargetValueInput';
export const MAX_DEPTH_INPUT_ID = 'maxDepthInput';

// Actions + output
export const RUN_BTN_ID = 'runBtn';
export const CLEAR_BTN_ID = 'clearBtn';
export const STATS_DIV_ID = 'statsDiv';
export const RESULT_DIV_ID = 'resultDiv';
export const LOG_DIV_ID = 'logDiv';
export const MATCHES_DIV_ID = 'matchesDiv';
export const MATCHES_LIST_ID = 'matchesList';
export const MATCH_MODAL_ID = 'matchModal';
export const MATCH_MODAL_BODY_ID = 'matchModalBody';
export const CLOSE_MODAL_BTN_ID = 'closeModalBtn';

// Getters
export function getPublicResolverCheckbox() { return document.getElementById(PUBLIC_RESOLVER_CHECKBOX_ID); }
export function getNodeInput() { return document.getElementById(NODE_INPUT_ID); }
export function getNetworkInput() { return document.getElementById(NETWORK_INPUT_ID); }
export function getConnectBtn() { return document.getElementById(CONNECT_BTN_ID); }
export function getStatusDiv() { return document.getElementById(STATUS_DIV_ID); }

export function getModeSelect() { return document.getElementById(MODE_SELECT_ID); }
export function getStartHashInput() { return document.getElementById(START_HASH_INPUT_ID); }
export function getMaxSecondsInput() { return document.getElementById(MAX_SECONDS_INPUT_ID); }
export function getMinTimestampInput() { return document.getElementById(MIN_TIMESTAMP_INPUT_ID); }
export function getPrefixesInput() { return document.getElementById(PREFIXES_INPUT_ID); }

export function getForwardOptions() { return document.getElementById(FORWARD_OPTIONS_ID); }
export function getSearchTextInput() { return document.getElementById(SEARCH_TEXT_INPUT_ID); }
export function getMatchModeSelect() { return document.getElementById(MATCH_MODE_SELECT_ID); }

export function getBackwardOptions() { return document.getElementById(BACKWARD_OPTIONS_ID); }
export function getBackwardTargetTypeSelect() { return document.getElementById(BACKWARD_TARGET_TYPE_SELECT_ID); }
export function getBackwardTargetValueInput() { return document.getElementById(BACKWARD_TARGET_VALUE_INPUT_ID); }
export function getMaxDepthInput() { return document.getElementById(MAX_DEPTH_INPUT_ID); }

export function getRunBtn() { return document.getElementById(RUN_BTN_ID); }
export function getClearBtn() { return document.getElementById(CLEAR_BTN_ID); }
export function getStatsDiv() { return document.getElementById(STATS_DIV_ID); }
export function getResultDiv() { return document.getElementById(RESULT_DIV_ID); }
export function getLogDiv() { return document.getElementById(LOG_DIV_ID); }
export function getMatchesDiv() { return document.getElementById(MATCHES_DIV_ID); }
export function getMatchesList() { return document.getElementById(MATCHES_LIST_ID); }
export function getMatchModal() { return document.getElementById(MATCH_MODAL_ID); }
export function getMatchModalBody() { return document.getElementById(MATCH_MODAL_BODY_ID); }
export function getCloseModalBtn() { return document.getElementById(CLOSE_MODAL_BTN_ID); }
