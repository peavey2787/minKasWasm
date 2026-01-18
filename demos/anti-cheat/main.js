// main.js - Anti-Cheat Demo entry point
// Modular architecture: imports all subsystems

import { initConnection } from './connection.js';
import { initVrfSources } from './vrf_sources.js';
import { initNistTests } from './nist_tests.js';
import { initPlayer } from './player.js';
import { initSpectator } from './spectator.js';
import { initTabs, initCollapsibles } from './utils.js';
import { $ } from './dom_elements.js';

async function init() {
  console.log('[AntiCheat] Initializing demo...');

  // Initialize tabs for VRF Sources and NIST sections only
  initTabs();

  // Initialize collapsible panels
  initCollapsibles();

  // Initialize each subsystem
  initConnection();
  initVrfSources();
  initNistTests();
  initPlayer();
  initSpectator();

  console.log('[AntiCheat] Demo ready.');
}

// Start when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
