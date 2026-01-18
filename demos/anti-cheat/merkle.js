// merkle.js - Simple Merkle tree implementation for anti-cheat anchoring

/**
 * Compute SHA-256 hash of a string and return hex
 * @param {string} input - String to hash
 * @returns {Promise<string>} - Hex hash
 */
export async function sha256Hex(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sync, deterministic hash for UI-only leaf hashing.
 * Not cryptographically secure; use sha256Hex/merkleRootSha256Hex for anchoring.
 * @param {string} input
 * @returns {string}
 */
export function hashLeafSync(input) {
  return simpleHash(String(input));
}

/**
 * Compute a SHA-256 Merkle root from an array of leaf hashes (hex strings).
 * Parent hash = SHA256(leftHex + rightHex) using UTF-8 of hex concatenation.
 * @param {string[]} leafHexes
 * @returns {Promise<string|null>}
 */
export async function merkleRootSha256Hex(leafHexes) {
  if (!Array.isArray(leafHexes) || leafHexes.length === 0) return null;

  let level = leafHexes.map(x => String(x));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(await sha256Hex(left + right));
    }
    level = next;
  }
  return level[0] || null;
}

/**
 * Synchronous SHA-256 using a simple hash (for leaf hashing)
 * Falls back to a simple deterministic hash if crypto.subtle is not available
 */
function simpleHash(str) {
  // Simple deterministic hash for synchronous use
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Combine two hashes into a parent hash
 * @param {string} left - Left child hash
 * @param {string} right - Right child hash
 * @returns {string} - Combined hash
 */
function combineHashes(left, right) {
  // For simplicity, we'll use a synchronous approach
  // In production, you'd use async SHA-256
  const combined = left + right;
  // Use a simple XOR-based combination for sync operation
  let result = '';
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = parseInt(left[i % left.length] || '0', 16);
    const r = parseInt(right[i % right.length] || '0', 16);
    result += ((l ^ r) ^ ((l + r) % 16)).toString(16);
  }
  return result.slice(0, 64).padEnd(64, '0');
}

/**
 * Simple Merkle Tree implementation
 * Supports incremental leaf addition with lazy root computation
 */
export class MerkleTree {
  constructor() {
    this.leaves = [];
    this.levels = [];
    this.root = null;
    this.dirty = false;
  }

  /**
   * Add a leaf to the tree
   * @param {string} hash - Hash of the leaf data
   */
  addLeaf(hash) {
    this.leaves.push(hash);
    this.dirty = true;
  }

  /**
   * Build the tree from current leaves
   */
  build() {
    if (this.leaves.length === 0) {
      this.root = null;
      this.levels = [];
      return;
    }

    this.levels = [[...this.leaves]];

    let currentLevel = this.levels[0];

    while (currentLevel.length > 1) {
      const nextLevel = [];
      
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left; // Duplicate last if odd
        nextLevel.push(combineHashes(left, right));
      }

      this.levels.push(nextLevel);
      currentLevel = nextLevel;
    }

    this.root = currentLevel[0];
    this.dirty = false;
  }

  /**
   * Get the Merkle root
   * @returns {string|null} - Root hash or null if empty
   */
  getRoot() {
    if (this.dirty || this.root === null) {
      this.build();
    }
    return this.root;
  }

  /**
   * Get proof for a leaf at given index
   * @param {number} index - Leaf index
   * @returns {Object[]} - Array of proof nodes
   */
  getProof(index) {
    if (this.dirty) {
      this.build();
    }

    if (index < 0 || index >= this.leaves.length) {
      return [];
    }

    const proof = [];
    let currentIndex = index;

    for (let level = 0; level < this.levels.length - 1; level++) {
      const currentLevel = this.levels[level];
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      if (siblingIndex < currentLevel.length) {
        proof.push({
          hash: currentLevel[siblingIndex],
          position: isRight ? 'left' : 'right',
        });
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  /**
   * Verify a proof
   * @param {string} leafHash - Hash of the leaf
   * @param {Object[]} proof - Proof array from getProof
   * @param {string} root - Expected root hash
   * @returns {boolean} - True if proof is valid
   */
  static verify(leafHash, proof, root) {
    let hash = leafHash;

    for (const node of proof) {
      if (node.position === 'left') {
        hash = combineHashes(node.hash, hash);
      } else {
        hash = combineHashes(hash, node.hash);
      }
    }

    return hash === root;
  }

  /**
   * Get tree statistics
   * @returns {Object}
   */
  getStats() {
    return {
      leafCount: this.leaves.length,
      levelCount: this.levels.length,
      root: this.getRoot(),
    };
  }

  /**
   * Export tree state for serialization
   * @returns {Object}
   */
  export() {
    return {
      leaves: [...this.leaves],
      root: this.getRoot(),
      timestamp: Date.now(),
    };
  }

  /**
   * Import tree state
   * @param {Object} data - Exported tree data
   */
  import(data) {
    this.leaves = data.leaves || [];
    this.dirty = true;
    this.build();
  }

  /**
   * Clear the tree
   */
  clear() {
    this.leaves = [];
    this.levels = [];
    this.root = null;
    this.dirty = false;
  }
}

/**
 * Create a Merkle tree from an array of data items
 * @param {string[]} items - Array of strings to hash as leaves
 * @returns {MerkleTree}
 */
export function createMerkleTree(items) {
  const tree = new MerkleTree();
  for (const item of items) {
    const hash = simpleHash(item);
    tree.addLeaf(hash);
  }
  tree.build();
  return tree;
}
