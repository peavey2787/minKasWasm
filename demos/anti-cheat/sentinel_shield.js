// sentinel_shield.js - Sentinel Shield UI Component
// Visual feedback loop for cryptographic audit state

import { $ } from './dom_elements.js';
import { AuditState, CheckResult, auditor } from './auditor.js';
import { state } from './state.js';

/**
 * SentinelShield - Real-time visual feedback for session integrity
 *
 * States:
 * - IDLE: Grey, dormant
 * - SCANNING: Yellow pulse animation
 * - VERIFIED: Green glow (persistent)
 * - TAMPERED: Red strobe + shatter effect (persistent until reset)
 * - ERROR: Orange, inconclusive (network/timeout)
 */
export class SentinelShield {
  constructor() {
    this.containerId = 'sentinelShieldContainer';
    this.shieldId = 'sentinelShield';
    this.resultsPanelId = 'auditResultsPanel';
    this.currentState = AuditState.IDLE;
    this.shattered = false;
    this._boundOnStateChange = this._onAuditStateChange.bind(this);
  }

  /**
   * Initialize the shield component
   */
  init() {
    auditor.subscribe(this._boundOnStateChange);
    this._render();
    this._bindEvents();
  }

  /**
   * Render the shield UI into the container
   */
  _render() {
    const container = $(this.containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="sentinel-shield-wrapper">
        <div id="${this.shieldId}" class="sentinel-shield idle">
          <div class="shield-icon">
            <svg viewBox="0 0 24 24" class="shield-svg">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
              <path class="shield-check" d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2"/>
            </svg>
          </div>
          <div class="shield-label">SENTINEL</div>
          <div class="shield-status">DORMANT</div>
        </div>

        <div class="audit-controls">
          <div class="control-group">
            <label for="auditMoveCount">Moves to Audit</label>
            <select id="auditMoveCount">
              <option value="5">Last 5</option>
              <option value="10">Last 10</option>
              <option value="25">Last 25</option>
              <option value="all">All Moves</option>
            </select>
          </div>
          <button id="verifySessionBtn" class="verify-btn">
            <span class="btn-icon">⚡</span>
            <span class="btn-text">VERIFY SESSION INTEGRITY</span>
          </button>
          <button id="resetAuditBtn" class="reset-audit-btn hidden">Reset Audit</button>
        </div>

        <div id="${this.resultsPanelId}" class="audit-results-panel hidden"></div>
      </div>

      <div id="shatterOverlay" class="shatter-overlay hidden">
        <div class="shatter-message">
          <span class="shatter-icon">⚠️</span>
          <span class="shatter-text">TAMPER DETECTED</span>
        </div>
      </div>
    `;
  }

  /**
   * Bind button events
   */
  _bindEvents() {
    const verifyBtn = $('verifySessionBtn');
    const resetBtn = $('resetAuditBtn');
    const moveSelect = $('auditMoveCount');

    if (verifyBtn) {
      verifyBtn.addEventListener('click', () => this._runAudit());
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => this._reset());
    }
  }

  /**
   * Run the audit
   */
  async _runAudit() {
    if (this.shattered) {
      // Cannot run new audit while shattered
      return;
    }

    const verifyBtn = $('verifySessionBtn');
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.classList.add('scanning');
    }

    const moveCountEl = $('auditMoveCount');
    const moveCount = moveCountEl?.value === 'all' ? 'all' : parseInt(moveCountEl?.value || '5');

    await auditor.runAudit({ moveCount });
  }

  /**
   * Reset the shield to idle state
   */
  _reset() {
    this.shattered = false;
    this.currentState = AuditState.IDLE;

    const shield = $(this.shieldId);
    const resultsPanel = $(this.resultsPanelId);
    const verifyBtn = $('verifySessionBtn');
    const resetBtn = $('resetAuditBtn');
    const shatterOverlay = $('shatterOverlay');

    if (shield) {
      shield.className = 'sentinel-shield idle';
      shield.querySelector('.shield-status').textContent = 'DORMANT';
    }

    if (resultsPanel) {
      resultsPanel.classList.add('hidden');
      resultsPanel.innerHTML = '';
    }

    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.classList.remove('scanning');
    }

    if (resetBtn) {
      resetBtn.classList.add('hidden');
    }

    if (shatterOverlay) {
      shatterOverlay.classList.add('hidden');
      shatterOverlay.classList.remove('active');
    }
  }

  /**
   * Handle audit state changes
   */
  _onAuditStateChange(newState, results) {
    this.currentState = newState;

    const shield = $(this.shieldId);
    const statusEl = shield?.querySelector('.shield-status');
    const verifyBtn = $('verifySessionBtn');
    const resetBtn = $('resetAuditBtn');
    const shatterOverlay = $('shatterOverlay');

    // Remove all state classes
    if (shield) {
      shield.classList.remove('idle', 'scanning', 'verified', 'tampered', 'error');
    }

    switch (newState) {
      case AuditState.SCANNING:
        if (shield) {
          shield.classList.add('scanning');
          statusEl.textContent = 'SCANNING...';
        }
        break;

      case AuditState.VERIFIED:
        if (shield) {
          shield.classList.add('verified');
          statusEl.textContent = 'VERIFIED';
        }
        if (verifyBtn) {
          verifyBtn.disabled = false;
          verifyBtn.classList.remove('scanning');
        }
        if (resetBtn) {
          resetBtn.classList.remove('hidden');
        }
        this._renderResults(results);
        break;

      case AuditState.TAMPERED:
        this.shattered = true;
        if (shield) {
          shield.classList.add('tampered');
          statusEl.textContent = 'TAMPERED';
        }
        if (shatterOverlay) {
          shatterOverlay.classList.remove('hidden');
          shatterOverlay.classList.add('active');
        }
        if (verifyBtn) {
          verifyBtn.disabled = true;
          verifyBtn.classList.remove('scanning');
        }
        if (resetBtn) {
          resetBtn.classList.remove('hidden');
        }
        this._renderResults(results, true);
        break;

      case AuditState.ERROR:
        if (shield) {
          shield.classList.add('error');
          statusEl.textContent = 'INCONCLUSIVE';
        }
        if (verifyBtn) {
          verifyBtn.disabled = false;
          verifyBtn.classList.remove('scanning');
        }
        if (resetBtn) {
          resetBtn.classList.remove('hidden');
        }
        this._renderResults(results);
        break;

      default:
        if (shield) {
          shield.classList.add('idle');
          statusEl.textContent = 'DORMANT';
        }
        break;
    }
  }

  /**
   * Render audit results
   */
  _renderResults(results, isTampered = false) {
    const panel = $(this.resultsPanelId);
    if (!panel || !results) return;

    const sessionId = results.sessionId?.slice(0, 8) || '--------';
    const statusClass = isTampered ? 'tampered' : 'verified';
    const statusIcon = isTampered ? '❌' : '✅';
    const statusText = isTampered ? 'TAMPER DETECTED' : 'AUDIT PASSED';

    const identityStatus = this._formatCheckStatus(results.identity);
    const integrityStatus = this._formatCheckStatus(results.integrity);
    const randomnessStatus = this._formatCheckStatus(results.randomness);
    const stateStatus = this._formatCheckStatus(results.state);

    panel.innerHTML = `
      <div class="audit-result-header ${statusClass}">
        <span class="result-icon">${statusIcon}</span>
        <span class="result-title">${statusText}: SESSION ${sessionId}</span>
      </div>

      <div class="audit-pillars">
        <div class="audit-pillar ${results.identity.status}">
          <div class="pillar-icon">${identityStatus.icon}</div>
          <div class="pillar-content">
            <div class="pillar-title">Identity</div>
            <div class="pillar-detail">${this._formatIdentityDetail(results.identity)}</div>
          </div>
        </div>

        <div class="audit-pillar ${results.integrity.status}">
          <div class="pillar-icon">${integrityStatus.icon}</div>
          <div class="pillar-content">
            <div class="pillar-title">Integrity</div>
            <div class="pillar-detail">${this._formatIntegrityDetail(results.integrity)}</div>
          </div>
        </div>

        <div class="audit-pillar ${results.randomness.status}">
          <div class="pillar-icon">${randomnessStatus.icon}</div>
          <div class="pillar-content">
            <div class="pillar-title">Randomness</div>
            <div class="pillar-detail">${this._formatRandomnessDetail(results.randomness)}</div>
          </div>
        </div>

        <div class="audit-pillar ${results.state.status}">
          <div class="pillar-icon">${stateStatus.icon}</div>
          <div class="pillar-content">
            <div class="pillar-title">State</div>
            <div class="pillar-detail">${this._formatStateDetail(results.state)}</div>
          </div>
        </div>
      </div>

      <div class="audit-conclusion ${statusClass}">
        ${isTampered
          ? '⚠️ <strong>WARNING:</strong> This game state has been compromised. Do not trust the outcome.'
          : '🔒 <strong>Conclusion:</strong> This game state is mathematically certain.'
        }
      </div>
    `;

    panel.classList.remove('hidden');
  }

  /**
   * Format check status
   */
  _formatCheckStatus(check) {
    switch (check.status) {
      case CheckResult.PASS:
        return { icon: '✅', class: 'pass' };
      case CheckResult.FAIL:
        return { icon: '❌', class: 'fail' };
      case CheckResult.SKIP:
        return { icon: '⏭️', class: 'skip' };
      case CheckResult.ERROR:
        return { icon: '⚠️', class: 'error' };
      default:
        return { icon: '❓', class: 'unknown' };
    }
  }

  /**
   * Format identity details
   */
  _formatIdentityDetail(check) {
    if (check.status === CheckResult.SKIP) {
      return check.details?.reason || 'Not audited';
    }
    if (check.status === CheckResult.PASS) {
      return `Schnorr Signature matches Wallet ${check.details?.walletAddress || 'N/A'}`;
    }
    if (check.status === CheckResult.FAIL) {
      return 'Signature verification FAILED';
    }
    return check.details?.error || 'Error during verification';
  }

  /**
   * Format integrity details
   */
  _formatIntegrityDetail(check) {
    if (check.status === CheckResult.SKIP) {
      return check.details?.reason || 'Not audited';
    }
    const d = check.details;
    if (check.status === CheckResult.PASS) {
      return `${d.validated}/${d.audited} XChaCha20-Poly1305 Tags Validated`;
    }
    if (check.status === CheckResult.FAIL) {
      return `${d.failed}/${d.audited} tags FAILED verification`;
    }
    return d.error || 'Error during verification';
  }

  /**
   * Format randomness details
   */
  _formatRandomnessDetail(check) {
    if (check.status === CheckResult.SKIP) {
      return check.details?.reason || 'Not audited';
    }
    const d = check.details;
    if (check.status === CheckResult.PASS) {
      return `Seed verified against Kaspa Block #${d.kaspaBlockHeight?.toLocaleString() || '?'}`;
    }
    if (check.status === CheckResult.FAIL) {
      return 'Block hash MISMATCH detected';
    }
    return d.reason || d.error || 'Network/API error';
  }

  /**
   * Format state details
   */
  _formatStateDetail(check) {
    if (check.status === CheckResult.SKIP) {
      return check.details?.reason || 'Not audited';
    }
    const d = check.details;
    if (check.status === CheckResult.PASS) {
      const warning = d.warning ? ` (${d.warning})` : '';
      return `Sequence numbers continuous; no replay detected${warning}`;
    }
    if (check.status === CheckResult.FAIL) {
      if (d.replays.length > 0) {
        return `REPLAY ATTACK: Duplicate seq ${d.replays.join(', ')}`;
      }
      return d.reason || 'State integrity compromised';
    }
    return d.error || 'Error during verification';
  }
}

// Singleton instance
export const sentinelShield = new SentinelShield();

/**
 * Initialize the sentinel shield (call from main.js)
 */
export function initSentinelShield() {
  sentinelShield.init();
}
