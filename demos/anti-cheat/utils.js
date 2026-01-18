// utils.js - Utility functions for anti-cheat demo

import { $, $$ } from './dom_elements.js';

/**
 * Set status badge text and type
 */
export function setStatus(elementId, text, type = 'pending') {
  const el = $(elementId);
  if (el) {
    el.textContent = text;
    el.className = `status-badge ${type}`;
  }
}

/**
 * Log message to an output panel
 */
export function log(panelId, msg, clear = false) {
  const panel = $(panelId);
  if (!panel) return;
  if (clear) panel.textContent = '';
  panel.textContent += msg + '\n';
  panel.scrollTop = panel.scrollHeight;
}

/**
 * Download data as JSON file
 */
export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Create a grid of cells
 */
export function createGrid(containerId, cellClass, size = 10) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = document.createElement('div');
      cell.className = cellClass;
      cell.dataset.x = x;
      cell.dataset.y = y;
      container.appendChild(cell);
    }
  }
}

/**
 * Initialize tab navigation
 */
export function initTabs() {
  const tabBtns = $$('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-content').forEach(c => c.classList.remove('active'));
      const tabId = 'tab-' + btn.dataset.tab;
      $(tabId)?.classList.add('active');
    });
  });
}

/**
 * Initialize collapsible sections
 */
export function initCollapsibles() {
  $$('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const targetId = header.dataset.target;
      const content = $(targetId);
      if (content) {
        content.classList.toggle('open');
        const arrow = header.querySelector('span:last-child');
        if (arrow) arrow.textContent = content.classList.contains('open') ? '▲' : '▼';
      }
    });
  });
}
