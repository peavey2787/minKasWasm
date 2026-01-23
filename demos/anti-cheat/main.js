// main.js - Anti-Cheat Demo entry point
// Modular architecture: imports all subsystems

import { initConnection } from './connection.js';
import { initVrfSources } from './vrf_sources.js';
import { initNistTests } from './nist_tests.js';
import { initPlayer } from './player/player.js';
import { initSpectator } from './spectator/spectator.js';
import { initTabs, initCollapsibles } from './utils.js';

async function init() {
  console.log('[AntiCheat] Initializing demo...');

  // Initialize tabs for VRF Sources and NIST sections only
  initTabs();

  // Initialize collapsible panels
  initCollapsibles();

  // Initialize each subsystem
  if (typeof initConnection === 'function') initConnection();
  if (typeof initVrfSources === 'function') initVrfSources();
  if (typeof initNistTests === 'function') initNistTests();
  if (typeof initPlayer === 'function') initPlayer();
  if (typeof initSpectator === 'function') initSpectator();

  console.log('[AntiCheat] Demo ready.');
}

// Start when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
