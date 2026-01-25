/**
 * Helper to convert hex strings to bytes (if not already in your wrapper utilities)
 */
export function hexToBytes(hex) {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert a Uint8Array or array of bytes to a hex string.
 * @param {Uint8Array|Array<number>} bytes - The bytes to convert.
 * @returns {string} Hex string.
 */
export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert a hex string to a UTF-8 string.
 * @param {string} hex
 * @returns {string}
 */
export function hexToUtf8(hex) {
  if (typeof hex !== "string" || hex.length === 0) return "";
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}
