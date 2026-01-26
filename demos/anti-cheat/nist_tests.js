// nist_tests.js - NIST randomness testing using KaspaPortal singleton

import { $ } from './dom_elements.js';
import { state, portal } from './state.js';
import { downloadJSON, hexToBinary } from './utils.js';

export async function runNistTests() {
  const source = $('nistSource').value;
  let bits = '';

  switch (source) {
    case 'kaspa':
      if (state.kaspaBlocks.length === 0) {
        alert('Collect Kaspa blocks first!');
        return;
      }
      bits = state.kaspaBlocks.map(b => hexToBinary(b.hash)).join('');
      break;
    case 'btc':
      if (state.btcBlocks.length === 0) {
        alert('Fetch Bitcoin blocks first!');
        return;
      }
      bits = state.btcBlocks.map(b => hexToBinary(b.hash)).join('');
      break;
    case 'qrng':
      if (state.qrngData.length === 0) {
        alert('Fetch QRNG data first!');
        return;
      }
      bits = state.qrngData.map(b => b.toString(2).padStart(8, '0')).join('');
      break;
    case 'folded':
      if (!state.foldedOutput) {
        alert('Fold sources first!');
        return;
      }
      bits = state.foldedOutput;
      break;
  }

  if (bits.length < 100) {
    alert('Need at least 100 bits for NIST tests. Current: ' + bits.length);
    return;
  }

  const totalTests = 18;
  const progressBar = $('nistProgress');
  const progressFill = progressBar.querySelector('.progress-bar-fill');
  const progressText = $('nistProgressText');
  progressBar.style.display = 'flex';
  progressFill.style.width = '0%';
  if (progressText) progressText.textContent = `Starting... (${bits.length.toLocaleString()} bits)`;

  const tbody = $('nistResultsBody');
  tbody.innerHTML = '';

  $('runNistBtn').disabled = true;
  $('stopNistBtn').disabled = false;
  $('exportNistBtn').disabled = true;

  try {
    // Use the portal singleton's NIST suite
    const results = await portal.fullNIST(bits);
    state.nistResults = results;

    // Render results
    for (const r of results) {
      const tr = document.createElement('tr');
      const statStr = (r.statistic !== null && typeof r.statistic === 'number')
        ? r.statistic.toFixed(6)
        : (r.statistic !== null ? String(r.statistic) : 'N/A');
      const pValStr = (r.pValue !== null && typeof r.pValue === 'number')
        ? r.pValue.toFixed(6)
        : (r.pValue !== null ? String(r.pValue) : 'N/A');
      tr.innerHTML = `
        <td>${r.testName || 'Unknown'}</td>
        <td>${statStr}</td>
        <td>${pValStr}</td>
        <td class="${r.passed ? 'nist-pass' : 'nist-fail'}">${r.passed ? 'PASS' : 'FAIL'}</td>
      `;
      tbody.appendChild(tr);
    }

    // Summary
    let passCount = results.filter(r => r.passed).length;
    const summaryRow = document.createElement('tr');
    summaryRow.innerHTML = `<td colspan="4" style="text-align:center;font-weight:bold;color:var(--accent);">✅ Complete: ${passCount}/${results.length} tests passed</td>`;
    tbody.appendChild(summaryRow);

    progressFill.style.width = '100%';
    if (progressText) progressText.textContent = 'Complete!';
    setTimeout(() => progressBar.style.display = 'none', 2000);
    $('exportNistBtn').disabled = false;

  } catch (err) {
    console.error('NIST error:', err);
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger);">Worker Error: ${err.message}</td></tr>`;
    progressBar.style.display = 'none';
  } finally {
    $('runNistBtn').disabled = false;
    $('stopNistBtn').disabled = true;
  }
}

export function stopNistTests() {
  // Since we are awaiting a promise, we can't easily cancel execution mid-flight
  // without abort signals which might not be supported by the facade yet.
  // For now, we just reset UI.
  $('runNistBtn').disabled = false;
  $('stopNistBtn').disabled = true;
  $('nistProgress').style.display = 'none';
  const tbody = $('nistResultsBody');
  const stopRow = document.createElement('tr');
  stopRow.innerHTML = `<td colspan="4" style="text-align:center;color:var(--warning);">⏹️ Tests stopped by user (UI reset)</td>`;
  tbody.appendChild(stopRow);
}

export function initNistTests() {
  if (!$('runNistBtn')) return; // Guard

  $('runNistBtn').addEventListener('click', runNistTests);

  const stopBtn = $('stopNistBtn');
  if (stopBtn) {
    stopBtn.addEventListener('click', stopNistTests);
  }

  $('exportNistBtn').addEventListener('click', () => {
    downloadJSON({
      source: $('nistSource').value,
      results: state.nistResults,
      timestamp: new Date().toISOString(),
    }, 'nist-results.json');
  });
}
