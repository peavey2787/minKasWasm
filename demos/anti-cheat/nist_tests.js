// nist_tests.js - NIST randomness testing using Web Worker

import { $ } from './dom_elements.js';
import { state } from './state.js';
import { downloadJSON } from './utils.js';

let nistWorker = null;

export async function runNistTests() {
  const source = $('nistSource').value;
  let bits = '';

  switch (source) {
    case 'kaspa':
      if (state.kaspaBlocks.length === 0) {
        alert('Collect Kaspa blocks first!');
        return;
      }
      bits = state.kaspaBlocks.map(b => state.portal.vrf.hexToBinary(b.hash)).join('');
      break;
    case 'btc':
      if (state.btcBlocks.length === 0) {
        alert('Fetch Bitcoin blocks first!');
        return;
      }
      bits = state.btcBlocks.map(b => state.portal.vrf.hexToBinary(b.hash)).join('');
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

  // Terminate any existing worker
  if (nistWorker) {
    nistWorker.terminate();
  }

  // Create new worker
  nistWorker = new Worker('./nist_worker.js');

  nistWorker.onmessage = function(e) {
    const msg = e.data;

    switch (msg.type) {
      case 'progress':
        // Test is about to start
        const pct = Math.round((msg.current / msg.total) * 100);
        progressFill.style.width = pct + '%';
        if (progressText) {
          progressText.textContent = `Running: ${msg.testName} (${msg.current + 1}/${msg.total})`;
        }
        break;

      case 'subprogress':
        // Sub-progress within a test (e.g., Binary Matrix Rank)
        if (progressText && msg.total > 0) {
          const subPct = Math.round((msg.current / msg.total) * 100);
          progressText.textContent = `${msg.test}: ${msg.current}/${msg.total} matrices (${subPct}%)`;
        }
        break;

      case 'result':
        // A test completed - add to table
        const r = msg.result;
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
        
        // Update progress
        const resultPct = Math.round((msg.current / msg.total) * 100);
        progressFill.style.width = resultPct + '%';
        if (progressText) {
          progressText.textContent = `Completed: ${msg.testName} (${msg.current}/${msg.total})`;
        }
        break;

      case 'complete':
        // All tests done
        state.nistResults = msg.results;
        
        // Add summary row
        let passCount = msg.results.filter(r => r.passed).length;
        const summaryRow = document.createElement('tr');
        summaryRow.innerHTML = `<td colspan="4" style="text-align:center;font-weight:bold;color:var(--accent);">✅ Complete: ${passCount}/${msg.results.length} tests passed</td>`;
        tbody.appendChild(summaryRow);

        progressFill.style.width = '100%';
        if (progressText) progressText.textContent = 'Complete!';
        setTimeout(() => progressBar.style.display = 'none', 2000);
        
        $('runNistBtn').disabled = false;
        $('stopNistBtn').disabled = true;
        $('exportNistBtn').disabled = false;
        
        nistWorker.terminate();
        nistWorker = null;
        break;
    }
  };

  nistWorker.onerror = function(err) {
    console.error('NIST Worker error:', err);
    tbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger);">Worker Error: ${err.message}</td></tr>`;
    progressBar.style.display = 'none';
    $('runNistBtn').disabled = false;
    $('stopNistBtn').disabled = true;
    
    if (nistWorker) {
      nistWorker.terminate();
      nistWorker = null;
    }
  };

  // Start the worker with the bits
  nistWorker.postMessage({ bits });
}

export function stopNistTests() {
  if (nistWorker) {
    nistWorker.terminate();
    nistWorker = null;
    $('runNistBtn').disabled = false;
    $('stopNistBtn').disabled = true;
    $('nistProgress').style.display = 'none';
    const tbody = $('nistResultsBody');
    const stopRow = document.createElement('tr');
    stopRow.innerHTML = `<td colspan="4" style="text-align:center;color:var(--warning);">⏹️ Tests stopped by user</td>`;
    tbody.appendChild(stopRow);
  }
}

export function initNistTests() {
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
