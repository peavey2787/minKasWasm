import { $, appendLog, setBadge } from './dom.js';
import { demoState } from './state.js';
import { sompiToKaspaString } from '../../kas-wasm/kaspa.js';

export function logStep(step, msg) {
  appendLog(`log_${step}`, msg);
  demoState.session.events.push({ t: Date.now(), step, msg });
}

export function setConnStatus(connected) {
  setBadge('connStatus', connected ? 'Connected' : 'Disconnected', connected ? 'connected' : 'disconnected');
}

export function setWalletStatus(text, cls) {
  setBadge('walletStatus', text, cls);
}

export function setUtxoStatus(text, cls) {
  setBadge('utxoStatus', text, cls);
}

export function setSelectStatus(text, cls) {
  setBadge('selectStatus', text, cls);
}

export function setBuildStatus(text, cls) {
  setBadge('buildStatus', text, cls);
}

export function setSignStatus(text, cls) {
  setBadge('signStatus', text, cls);
}

export function setSubmitStatus(text, cls) {
  setBadge('submitStatus', text, cls);
}

export function renderWalletInfo() {
  const recv = $('walletReceive');
  const chg = $('walletChange');
  const bal = $('walletBalance');
  if (recv) recv.value = demoState.walletReceiveAddress || '';
  if (chg) chg.value = demoState.walletChangeAddress || '';
  if (bal) {
    bal.textContent = demoState.walletBalanceMatureKas != null ? `${demoState.walletBalanceMatureKas} KAS` : '--';
  }
}

export function renderUtxos({ onToggle } = {}) {
  const body = $('utxoTableBody');
  if (!body) return;

  body.innerHTML = '';

  for (let i = 0; i < demoState.utxos.length; i++) {
    const e = demoState.utxos[i];
    const outpoint = e.outpoint;
    const checked = demoState.selectedOutpoints.has(outpoint);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" data-idx="${i}" ${checked ? 'checked' : ''}></td>
      <td>${sompiToKaspaString(e.amountSompi)}</td>
      <td>${e.amountSompi.toString()}</td>
      <td title="${outpoint}">${outpoint}</td>
      <td>${e.addressKind}</td>
    `;

    const cb = tr.querySelector('input[type=checkbox]');
    cb.addEventListener('change', () => {
      try {
        onToggle?.(i, cb.checked);
      } catch {
        // ignore
      }
    });

    body.appendChild(tr);
  }
}

export function renderUtxoStats() {
  const s = demoState.utxoStats;
  if (!s) {
    $('utxoCount').textContent = '--';
    $('utxoTotal').textContent = '--';
    $('utxoMinMax').textContent = '--';
    $('utxoMedian').textContent = '--';
    return;
  }

  $('utxoCount').textContent = String(s.count);
  $('utxoTotal').textContent = sompiToKaspaString(s.totalSompi);
  $('utxoMinMax').textContent = `${sompiToKaspaString(s.minSompi)} / ${sompiToKaspaString(s.maxSompi)}`;
  $('utxoMedian').textContent = sompiToKaspaString(s.medianSompi);
}

export function renderSelectionStats({ targetSompi } = {}) {
  $('selCount').textContent = String(demoState.selectedEntries.length);
  $('selSum').textContent = sompiToKaspaString(demoState.selectedSumSompi);

  if (targetSompi != null) {
    $('selTarget').textContent = sompiToKaspaString(targetSompi);
    const cov = targetSompi > 0n ? Number((demoState.selectedSumSompi * 10000n) / targetSompi) / 100 : 0;
    $('selCoverage').textContent = `${cov.toFixed(2)}%`;
  } else {
    $('selTarget').textContent = '--';
    $('selCoverage').textContent = '--';
  }
}

export function renderPendingTx() {
  const sum = demoState.pendingTxSummary;
  $('txMass').textContent = sum?.mass != null ? String(sum.mass) : '--';
  $('txFee').textContent = sum?.feeAmount != null ? sompiToKaspaString(sum.feeAmount) : '--';
  $('txChange').textContent = sum?.changeAmount != null ? sompiToKaspaString(sum.changeAmount) : '--';
  $('txMinSigs').textContent = sum?.minimumSignatures != null ? String(sum.minimumSignatures) : '--';

  $('txJson').textContent = demoState.pendingTxJson || '';
}

export function renderDerivedKeys() {
  $('derivedReceive').value = demoState.derivedKeys?.receive?.address || '';
  $('derivedChange').value = demoState.derivedKeys?.change?.address || '';
}

export function renderSubmit() {
  $('txid').value = demoState.txid || '';
  $('submitJson').textContent = demoState.submitRes ? JSON.stringify(demoState.submitRes, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) : '';
}

export function setEnabled() {
  const connected = demoState.connected;
  const walletReady = demoState.walletReady;
  const hasUtxos = demoState.utxos.length > 0;
  const hasSelection = demoState.selectedEntries.length > 0;
  const hasPending = !!demoState.pendingTx;
  const hasKeys = !!demoState.derivedKeys;
  const signed = !!demoState.signed;

  $('btnWallet').disabled = !connected;
  $('btnCopyReceive').disabled = !demoState.walletReceiveAddress;

  $('btnFetchUtxos').disabled = !walletReady;
  $('btnAutoSelect').disabled = !hasUtxos;
  $('btnClearSelect').disabled = !hasSelection;

  $('btnEstimate').disabled = !hasSelection;
  $('btnBuild').disabled = !hasSelection;
  $('btnDeriveKeys').disabled = !hasPending;
  $('btnSign').disabled = !hasPending || !hasKeys;
  $('btnSubmit').disabled = !signed;
  $('btnCopyTxid').disabled = !demoState.txid;
}
