// dom_listeners.js
// Attach DOM event listeners for the DAG walk demo

import * as elements from './dom_elements.js';
import * as handlers from './dom_handlers.js';

export function attachListeners() {
  elements.getConnectBtn().onclick = handlers.handleConnectClick;
  elements.getRunBtn().onclick = handlers.handleRunClick;
  elements.getClearBtn().onclick = handlers.handleClearClick;
  elements.getModeSelect().onchange = handlers.handleModeChange;
}
