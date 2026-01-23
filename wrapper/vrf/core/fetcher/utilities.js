// utilities.js - Minimal stub for browser
export function generateMockBlocks(n, source) {
  // Returns n mock blocks with random hashes
  return Array.from({ length: n }, (_, i) => ({
    hash: Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
    height: 1000 + i,
    time: Date.now(),
    source,
    confirms: 10,
    isFinal: true
  }));
}
