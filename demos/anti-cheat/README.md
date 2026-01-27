> ### 📍 Navigation
> * [🏠 Project Hub](../../README.md)
> * [🏛️ Facade Guide](../../wrapper/FACADE_GUIDE.md)
> * [🔍 Intelligence Guide](../../wrapper/intelligence/README.md)
> * [🔍 Low Level Guide](../../wrapper/LOW_LEVEL_SDK.md)
> * [📡 KKTP Protocol](../../kktp/protocol/KKTP_PROTOCOL.md)

# KKTP Anti-Cheat Demo

> **Mathematical Certainty for Online Gaming.**
> This is the reference implementation of the KKTP Protocol, demonstrating zero-trust session integrity anchored to the Kaspa BlockDAG.

## Overview
This demo showcases the full lifecycle of a secure gaming session:
* **Session Establishment:** DH-Handshake via discovery/response anchors.
* **Secure Transport:** Move-batches protected by XChaCha20-Poly1305 AEAD.
* **Public Auditability:** Real-time verification of game state using the **Sentinel Shield**.

## The Four Pillars of Verification
The **Sentinel Shield** (built-in auditor) provides a testable implementation of the security properties defined in [KKTP_PROTOCOL.md](../../kktp/protocol/KKTP_PROTOCOL.md):

* ✅ **Identity:** Schnorr Signature verification ensures the player is who they claim to be.
* ✅ **Integrity:** Validates AEAD tags and Schnorr anchors to prove data hasn't been tampered with in transit.
* ✅ **Randomness:** Cross-references VRF entropy against public Kaspa block data to prevent seed manipulation.
* ✅ **State Continuity:** Analyzes sequence numbers to detect and block Replay Attacks or skipped state.



## Technical Stack
* **Curve:** X25519 (Key Exchange)
* **Signatures:** Schnorr (Identity)
* **Encryption:** XChaCha20-Poly1305 (AEAD)
* **Entropy Source:** Kaspa BlockDAG (Decentralized Randomness)

## Quick Start
1. Open `player.html` and `spectator.html` in your browser.
2. Connect and search for game sessions on the Spectator side.
3. Connect, fund the wallet, and then start game on the Player side.
4. Use the **Sentinel Shield** on the Spectator side to run a live cryptographic audit.

## Key Architecture
* **[auditor.js](auditor.js):** The core cryptographic verification engine.
* **[kktp_lib.js](kktp_lib.js):** Low-level primitives for signing and encryption.
* **[vrf_sources.js](vrf_sources.js):** Logic for fetching and folding blockchain entropy.

---
*Note: This implementation is designed for educational transparency and as a template for third-party verification tooling.*
