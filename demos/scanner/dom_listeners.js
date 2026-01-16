// dom_listeners.js
// Attach all DOM event listeners for scanner UI
import * as elements from './dom_elements.js';
import * as handlers from './dom_handlers.js';

export function attachListeners() {

  // Connect button
  elements.getConnectBtn().onclick = handlers.handleConnectClick;

  // Start indexer button
  elements.getStartIndexerBtn().onclick = handlers.handleStartIndexerClick;

  // Clear Indexer buttons
  elements.getClearMatchingTxsBtn().onclick = handlers.handleClearMatchingTxsClick;
  elements.getClearAllTxsBtn().onclick = handlers.handleClearAllTxsClick;
  elements.getClearBlocksBtn().onclick = handlers.handleClearBlocksClick;

  // Toggle in-memory/cached buttons
  elements.getToggleInMemoryBtn().onclick = handlers.handleToggleInMemoryClick;
  elements.getToggleCachedBtn().onclick = handlers.handleToggleCachedClick;

  // Match mode select
  elements.getMatchModeSelect().onchange = handlers.handleMatchModeChange;

  // Start/Stop button
  elements.getStartStopBtn().onclick = handlers.handleStartStopClick;

  // Stop indexer button
  elements.getStopIndexerBtn().onclick = handlers.handleStopIndexerClick;

  // Create wallet button
  elements.getCreateWalletBtn().onclick = handlers.handleCreateWalletClick;

  // Send button
  elements.getSendBtn().onclick = handlers.handleSendClick;

  // Copy button
  elements.getCopyBtn().onclick = handlers.handleCopyClick;
}
