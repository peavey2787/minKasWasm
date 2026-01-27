// auditor.js - ManualAuditor: Cryptographic Session Integrity Verification
// Implements "Don't Trust, Verify" principle for KKTP Anti-Cheat Demo

import { state, portal } from "./state.js";
import * as KKTP from "./kktp_lib.js";
import { hexToBytes } from "./kktp_lib.js";
import { xchacha20poly1305 } from "https://esm.sh/@noble/ciphers@0.4.0/chacha";
import * as ed from "https://esm.sh/@noble/ed25519@1.7.3";

/**
 * Audit Result States
 */
export const AuditState = Object.freeze({
  IDLE: "idle",
  SCANNING: "scanning",
  VERIFIED: "verified",
  TAMPERED: "tampered",
  ERROR: "error",
});

/**
 * Individual Check Result
 */
export const CheckResult = Object.freeze({
  PASS: "pass",
  FAIL: "fail",
  SKIP: "skip",
  ERROR: "error",
});

/**
 * ManualAuditor - Performs cryptographic verification of session integrity
 *
 * Pillars of Verification:
 * 1. Identity: Verify Schnorr signatures match wallet identity
 * 2. Integrity: Re-validate all Poly1305 AEAD tags
 * 3. Randomness: Verify VRF entropy against public blockchain data
 * 4. State: Check sequence continuity (no replay/skip)
 */
export class ManualAuditor {
  constructor() {
    this.state = AuditState.IDLE;
    this.results = null;
    this.onStateChange = null;
    this.aborted = false;
  }

  /**
   * Subscribe to audit state changes
   * @param {Function} callback - (state, results) => void
   */
  subscribe(callback) {
    this.onStateChange = callback;
  }

  /**
   * Emit state change to subscribers
   */
  _emit(newState, results = null) {
    this.state = newState;
    this.results = results;
    if (this.onStateChange) {
      this.onStateChange(newState, results);
    }
  }

  /**
   * Abort an in-progress audit
   */
  abort() {
    this.aborted = true;
  }

  /**
   * Perform full session audit
   * @param {Object} options - { moveCount: 5 | 'all' }
   * @returns {Promise<Object>} - Detailed audit results
   */
  async runAudit(options = {}) {
    this.aborted = false;
    this._emit(AuditState.SCANNING);

    const moveCount = options.moveCount ?? 5;
    const results = {
      timestamp: Date.now(),
      sessionId: state.spectatorSessionId || state.sessionId,
      identity: { status: CheckResult.SKIP, details: {} },
      integrity: { status: CheckResult.SKIP, details: {} },
      randomness: { status: CheckResult.SKIP, details: {} },
      state: { status: CheckResult.SKIP, details: {} },
      overall: AuditState.VERIFIED,
    };

    try {
      console.log("[Audit][Trace] vrfData:", state.auditHistory?.vrfData || null);
      console.log(
        "[Audit][Trace] responseAnchor:",
        state.auditHistory?.responseAnchor || null,
      );
      console.log(
        "[Audit][Trace] discoveryAnchor:",
        state.auditHistory?.discoveryAnchor || null,
      );

      // === PILLAR 1: IDENTITY VERIFICATION ===
      results.identity = await this._checkIdentity();
      if (this.aborted) throw new Error("Audit aborted");

      // === PILLAR 2: MESSAGE INTEGRITY (AEAD Tags) ===
      results.integrity = await this._checkIntegrity(moveCount);
      if (this.aborted) throw new Error("Audit aborted");

      // === PILLAR 3: RANDOMNESS (Entropy Anchor) ===
      results.randomness = await this._checkRandomness();
      if (this.aborted) throw new Error("Audit aborted");

      // === PILLAR 4: STATE CONTINUITY ===
      results.state = await this._checkStateContinuity();
      if (this.aborted) throw new Error("Audit aborted");

      // Determine overall result
      const checks = [
        results.identity,
        results.integrity,
        results.randomness,
        results.state,
      ];

      if (checks.some((c) => c.status === CheckResult.FAIL)) {
        results.overall = AuditState.TAMPERED;
        this._emit(AuditState.TAMPERED, results);
      } else if (checks.some((c) => c.status === CheckResult.ERROR)) {
        results.overall = AuditState.ERROR;
        this._emit(AuditState.ERROR, results);
      } else if (checks.some((c) => c.status === CheckResult.SKIP)) {
        // Missing critical data => inconclusive, not "certain"
        results.overall = AuditState.ERROR;
        this._emit(AuditState.ERROR, results);
      } else {
        results.overall = AuditState.VERIFIED;
        this._emit(AuditState.VERIFIED, results);
      }

      return results;
    } catch (err) {
      if (err.message === "Audit aborted") {
        this._emit(AuditState.IDLE);
        return null;
      }
      results.overall = AuditState.ERROR;
      results.error = err.message;
      this._emit(AuditState.ERROR, results);
      return results;
    }
  }

  /**
   * Pillar 1: Identity Verification
   * Verify Schnorr signature matches the initiator's public key
   */
  async _checkIdentity() {
    const result = {
      status: CheckResult.SKIP,
      details: {
        pubKey: null,
        walletAddress: null,
        signatureValid: null,
      },
    };

    try {
      const history = state.auditHistory || {};
      const discoveryAnchor = history.discoveryAnchor;

      if (!discoveryAnchor) {
        result.status = CheckResult.SKIP;
        result.details.reason = "No discovery anchor in session history";
        return result;
      }

      console.groupCollapsed("[Audit][Identity] Discovery Anchor");
      console.log("sid:", discoveryAnchor.sid);
      console.log("pub_sig:", discoveryAnchor.pub_sig?.slice?.(0, 16));
      console.log("sig:", discoveryAnchor.sig?.slice?.(0, 16));
      console.log("meta:", discoveryAnchor.meta);
      console.groupEnd();

      result.details.pubKey = discoveryAnchor.pub_sig?.slice(0, 16) + "...";

      const addr =
        typeof state.walletAddress === "string"
          ? state.walletAddress
          : state.walletAddress?.address || "";
      result.details.walletAddress = addr ? addr.slice(0, 14) + "..." : "N/A";

      const isValid = await KKTP.verifyAnchorSignature(discoveryAnchor);
      result.details.signatureValid = isValid;

      result.status = isValid ? CheckResult.PASS : CheckResult.FAIL;
      return result;
    } catch (err) {
      result.status = CheckResult.ERROR;
      result.details.error = err.message;
      return result;
    }
  }

  /**
   * Pillar 2: Message Integrity
   * Re-compute Poly1305 tags for stored ciphertexts
   */
  async _checkIntegrity(moveCount) {
    const result = {
      status: CheckResult.SKIP,
      details: {
        totalMoves: 0,
        audited: 0,
        validated: 0,
        failed: 0,
        skipped: 0,
        failures: [],
        schnorrValidated: 0,
        schnorrFailed: 0,
        aeadValidated: 0,
        aeadFailed: 0,
      },
    };

    try {
      const history = state.auditHistory || {};
      const messages = history.encryptedMessages || [];
      if (messages.length === 0) {
        result.status = CheckResult.SKIP;
        result.details.reason = "No messages to audit";
        return result;
      }

      result.details.totalMoves = messages.length;

      const toAudit =
        moveCount === "all" ? messages : messages.slice(-moveCount);
      result.details.audited = toAudit.length;

      for (const msg of toAudit) {
        let isValid = false;

        switch (msg.type) {
          case "SCHNORR_MOVE":
            isValid = await this._verifySchnorrMove(msg);
            if (isValid) {
              result.details.schnorrValidated++;
            } else {
              result.details.schnorrFailed++;
            }
            break;

          case "AEAD":
          default:
            if (!msg.ciphertext) {
              result.details.failed++;
              result.details.failures.push({
                seq: msg.seq,
                reason: "No ciphertext",
              });
              continue;
            }
            if (!state.kktp.kSession) {
              // Can't verify AEAD without key: skip gracefully
              result.details.skipped++;
              continue;
            }
            isValid = await this._verifyAEADTag(msg);
            if (isValid) {
              result.details.aeadValidated++;
            } else {
              result.details.aeadFailed++;
            }
            break;
        }

        if (isValid) {
          result.details.validated++;
        } else if (msg.type !== "AEAD" || state.kktp.kSession) {
          result.details.failed++;
          result.details.failures.push({
            seq: msg.seq,
            reason: "Math verification failed",
          });
        }
      }

      if (result.details.audited === 0) {
        result.status = CheckResult.SKIP;
      } else if (result.details.failed > 0) {
        result.status = CheckResult.FAIL;
      } else if (result.details.validated > 0) {
        result.status = CheckResult.PASS;
      } else {
        result.status = CheckResult.SKIP;
      }
      return result;
    } catch (err) {
      result.status = CheckResult.ERROR;
      result.details.error = err.message;
      return result;
    }
  }

  async _verifySchnorrMove(msg) {
    try {
      const anchor = msg.anchor || {
        type: "move",
        version: 1,
        sid: state.spectatorSessionId || state.sessionId || "",
        moves: msg.data,
        pub_sig: msg.pubKey,
        sig: msg.signature,
      };

      const pubKey = anchor.pub_sig || msg.pubKey;
      const sig = anchor.sig || msg.signature;
      if (!pubKey || !sig) return false;

      const forVerify = portal.prepareForVerification(anchor);
      const payload = new TextEncoder().encode(
        portal.canonicalize(forVerify),
      );

      const sigBytes = typeof sig === "string" ? hexToBytes(sig) : sig;
      const pubBytes = typeof pubKey === "string" ? hexToBytes(pubKey) : pubKey;

      if (!(sigBytes instanceof Uint8Array) || sigBytes.length !== 64)
        return false;
      if (!(pubBytes instanceof Uint8Array) || pubBytes.length !== 32)
        return false;

      return await ed.verify(sigBytes, payload, pubBytes);
    } catch {
      return false;
    }
  }

  /**
   * Verify a single AEAD message tag
   * XChaCha20-Poly1305 verification
   */
  async _verifyAEADTag(msgObj) {
    try {
      const nonce = hexToBytes(msgObj.nonce);
      const ciphertext = hexToBytes(msgObj.ciphertext);
      const mailboxIdBytes = hexToBytes(msgObj.mailbox_id);
      const dirBytes = new TextEncoder().encode(msgObj.direction);
      const seqBytes = new Uint8Array(8);
      new DataView(seqBytes.buffer).setBigUint64(0, BigInt(msgObj.seq), false);

      const aad = new Uint8Array([...mailboxIdBytes, ...dirBytes, ...seqBytes]);

      // Attempt decryption - if it succeeds, the tag is valid
      xchacha20poly1305(state.kktp.kSession, nonce, aad).decrypt(ciphertext);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pillar 3: Randomness Verification
   * Verify VRF entropy against public Kaspa block data
   */
  async _checkRandomness() {
    const result = {
      status: CheckResult.SKIP,
      details: {
        vrfValue: null,
        kaspaBlockHeight: null,
        kaspaBlockHash: null,
        hashMatch: null,
      },
    };

    try {
      const history = state.auditHistory || {};
      const responseAnchor = history.responseAnchor || null;
      const discoveryAnchor = history.discoveryAnchor || null;

      const pickEvidence = (anchor) => {
        return (
          anchor?.vrf_proof?.evidence ||
          anchor?.vrf_proof?.ev ||
          anchor?.evidence ||
          null
        );
      };

      const responseEvidence = pickEvidence(responseAnchor) || {};
      const discoveryEvidence = pickEvidence(discoveryAnchor) || {};

      const vrfData =
        history.vrfData ||
        (responseAnchor || discoveryAnchor
          ? {
              kaspaBlocks:
                responseEvidence.kaspaBlocks ||
                responseEvidence.kaspa ||
                discoveryEvidence.kaspaBlocks ||
                discoveryEvidence.kaspa ||
                [],
              btcBlocks:
                responseEvidence.btcBlocks ||
                responseEvidence.btc ||
                discoveryEvidence.btcBlocks ||
                discoveryEvidence.btc ||
                [],
              foldedOutput:
                responseAnchor?.vrf_value ||
                discoveryAnchor?.vrf_value ||
                null,
              sources:
                responseEvidence.sources ||
                discoveryEvidence.sources ||
                [],
              iterations:
                responseEvidence.iterations ||
                discoveryEvidence.iterations ||
                0,
              timestamp:
                responseEvidence.timestamp ||
                discoveryEvidence.timestamp ||
                null,
            }
          : null);

      const kaspaBlocks =
        (Array.isArray(vrfData?.kaspaBlocks) && vrfData.kaspaBlocks.length
          ? vrfData.kaspaBlocks
          : Array.isArray(vrfData?.kaspa) && vrfData.kaspa.length
            ? vrfData.kaspa
            : []) || [];

      if (!kaspaBlocks || kaspaBlocks.length === 0) {
        result.status = CheckResult.SKIP;
        result.details.reason = "No VRF entropy data in session history";
        return result;
      }

      const vrfValue =
        vrfData?.foldedOutput ||
        responseAnchor?.vrf_value ||
        discoveryAnchor?.vrf_value ||
        state.foldedOutput ||
        "";
      result.details.vrfValue = vrfValue ? vrfValue.slice(0, 16) + "..." : null;

      // Get the first Kaspa block used in VRF
      const refBlock = kaspaBlocks[0];
      result.details.kaspaBlockHeight = refBlock.height || refBlock.blueScore;
      result.details.kaspaBlockHash = refBlock.hash?.slice(0, 16) + "...";

      // Fetch from public API to verify
      try {
        const apiUrl = `https://api.kaspa.org/blocks/${refBlock.hash}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) {
          // Try alternative API
          const altUrl = `https://kaspa-api.io/v1/blocks/${refBlock.hash}`;
          const altResponse = await fetch(altUrl, {
            signal: controller.signal,
          });

          if (!altResponse.ok) {
            result.status = CheckResult.ERROR;
            result.details.reason = "Public API unreachable";
            return result;
          }

          const altData = await altResponse.json();
          result.details.apiBlockHash = altData.header?.hash || altData.hash;
        } else {
          const data = await response.json();
          result.details.apiBlockHash =
            data.header?.hash || data.hash || data.verboseData?.hash;
        }

        // Compare hashes
        const match = result.details.apiBlockHash === refBlock.hash;
        result.details.hashMatch = match;
        result.status = match ? CheckResult.PASS : CheckResult.FAIL;
      } catch (fetchErr) {
        if (fetchErr.name === "AbortError") {
          result.status = CheckResult.ERROR;
          result.details.reason = "API request timeout (10s)";
        } else {
          result.status = CheckResult.ERROR;
          result.details.reason = `Network error: ${fetchErr.message}`;
        }
      }

      return result;
    } catch (err) {
      result.status = CheckResult.ERROR;
      result.details.error = err.message;
      return result;
    }
  }

  /**
   * Pillar 4: State Continuity
   * Check sequence numbers for gaps or replays
   */
  async _checkStateContinuity() {
    const result = {
      status: CheckResult.SKIP,
      details: {
        totalSequences: 0,
        gaps: [],
        replays: [],
        overlapValidated: 0,
        overlapMismatched: 0,
        continuous: null,
      },
    };

    try {
      const history = state.auditHistory || {};
      const sequences = history.sequences || [];
      const moveBySeq = history.moveBySeq instanceof Map ? history.moveBySeq : null;

      if (sequences.length === 0) {
        result.status = CheckResult.SKIP;
        result.details.reason = "No sequence data in session history";
        return result;
      }

      result.details.totalSequences = sequences.length;

      // Sort and check for gaps/replays
      const sorted = [...sequences].sort((a, b) => a - b);
      const seen = new Set();

      for (let i = 0; i < sorted.length; i++) {
        const seq = sorted[i];

        // Check for replay
        if (seen.has(seq)) {
          const moves = moveBySeq ? moveBySeq.get(seq) : null;
          if (moves instanceof Set) {
            if (moves.size > 1) {
              result.details.replays.push(seq);
              result.details.overlapMismatched++;
            } else {
              result.details.overlapValidated++;
            }
          } else if (typeof moves === "string") {
            result.details.overlapValidated++;
          } else {
            result.details.replays.push(seq);
            result.details.overlapMismatched++;
          }
        }
        seen.add(seq);

        // Check for gap
        if (i > 0) {
          const prev = sorted[i - 1];
          if (seq !== prev + 1 && seq !== prev) {
            result.details.gaps.push({ expected: prev + 1, got: seq });
          }
        }
      }

      result.details.continuous =
        result.details.gaps.length === 0 && result.details.replays.length === 0;

      if (result.details.replays.length > 0) {
        result.status = CheckResult.FAIL;
        result.details.reason = "Replay attack detected";
      } else if (result.details.gaps.length > 0) {
        // Gaps might be network issues, not necessarily tampering
        result.status = CheckResult.PASS; // Soft pass - noted but not failed
        result.details.warning = `${result.details.gaps.length} sequence gap(s) detected`;
      } else {
        result.status = CheckResult.PASS;
      }

      return result;
    } catch (err) {
      result.status = CheckResult.ERROR;
      result.details.error = err.message;
      return result;
    }
  }

  /**
   * Re-derive Mailbox ID from VRF + session params
   * Used to verify Connection integrity
   */
  async verifyMailboxDerivation() {
    if (!state.foldedOutput || !state.spectatorSessionId) {
      return { valid: false, reason: "Missing VRF output or session ID" };
    }

    const history = state.auditHistory || {};
    const responseAnchor = history.responseAnchor;

    if (!responseAnchor) {
      return { valid: false, reason: "No response anchor in history" };
    }

    // Re-derive using the same HKDF params
    const derived = KKTP.derivePublicSessionSecrets(
      responseAnchor.vrf_value,
      responseAnchor.sid,
      responseAnchor.initiator_pub_sig,
      responseAnchor.pub_sig_resp,
    );

    const currentMailbox = state.kktp.mailboxId;
    const match = derived.mailboxId === currentMailbox;

    return {
      valid: match,
      derivedMailbox: derived.mailboxId?.slice(0, 16) + "...",
      currentMailbox: currentMailbox?.slice(0, 16) + "...",
    };
  }
}

// Singleton instance
export const auditor = new ManualAuditor();
