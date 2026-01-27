# 🌀 minKasWasm: The ꓘK Engine Room

> **The high-performance implementation of the Kaspa Kinesis Transport Protocol (KKTP) and Recursive Folding Entropy.**

This repository serves as the core technical foundation for [**Kaspa Kinesis (ꓘK)**](https://github.com/peavey2787/KaspaKinesis). It houses the Kaspa WASM SDK integration, the decentralized VRF (Verifiable Randomness Function), and the serverless relay infrastructure.

---

## 🗺️ Documentation Map
> ### 📍 Navigation
> * [🏛️ Facade Guide](./wrapper/FACADE_GUIDE.md)
> * [🔍 Intelligence Guide](./wrapper/intelligence/README.md)
> * [🔍 Low Level Guide](./wrapper/LOW_LEVEL_SDK.md)
> * [📡 KKTP Protocol](./kktp/protocol/KKTP_PROTOCOL.md)
> * [🛡️ Anti-Cheat Demo](./demos/anti-cheat/README.md)

---

## ⚡ Core Technical Pillars

### 1. Recursive Folding (Decentralized VRF)
The implementation of a novel entropy-extraction method. It fetches PoW artifacts directly from the Kaspa BlockDAG and "folds" them into **NIST SP 800-22 compliant randomness**.
* **Verifiable:** Anyone can replay the fold to prove the seed.
* **Unbiased:** Entropy is derived from the network's hash power.

### 2. Serverless Relay (KKTP)
A zero-infrastructure communication layer. By treating the Kaspa DAG as a global "mailbox," `minKasWasm` enables **CGNAT-to-CGNAT connectivity** without the need for STUN/TURN servers or central matchmaking.

### 3. Intelligence Layer
A high-throughput browser scanner and indexer. It uses **IndexedDB** for persistent state and a prioritized eviction policy to handle real-time BlockDAG data without crashing the browser environment.

---

## 🧪 Interactive Demos
This repository contains **11+ live demos** showcasing the engine's capabilities:

* **Sentinel Shield:** A full anti-cheat session demo using KKTP + VRF.
* **DAG Walker:** Real-time visualization of block traversal.
* **NIST Dashboard:** Live statistical testing of the Recursive Folding output.
* **Wallet Scanner:** High-speed payload discovery for decentralized messaging.

> **Note:** To run demos, serve the root directory via any local web server (e.g., Live Server, Laragon, or Python `http.server`) and navigate to the `/demos` folder.

---

## 🏗️ Architecture
This project follows a strict **Layered Facade Pattern** to ensure the complexity of the BlockDAG is accessible without losing granular control.

* **WASM Layer:** The raw Rust-to-JS bridge for Kaspa.
* **Wrapper Layer:** JS classes for specific tasks (Wallet, VRF, Indexer).
* **Portal Layer:** The `kaspaPortal` singleton—the orchestrator for ꓘK applications.

---

## 👥 Solo-Driven Innovation
`minKasWasm` is currently a solo-developed framework, representing a full-stack engineering effort across:
* **Cryptographic Research** (Recursive Folding)
* **Protocol Design** (KKTP/IETF Drafts)
* **Systems Engineering** (WASM / IndexedDB / Networking)

---

## 🏛️ Acknowledgments & Mission
Built for the **Kaspa Ecosystem**. Our goal is to transform the BlockDAG from a simple value-transfer layer into a robust, serverless backbone for the next generation of decentralized interactive systems.

**[Go to the Facade Guide to get started →](/wrapper/FACADE_GUIDE.md)**
