// helpers.js - Shared utility functions for UI

/**
 * Format a timestamp as "Xs ago", "Xm ago", or "Xh ago"
 */
export function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text) {
  if (text == null) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * Truncate an address for display (8...6 format)
 */
export function truncateAddress(address) {
  if (!address) return "";
  const addrStr = address.toString();
  if (addrStr.length <= 16) return addrStr;
  return `${addrStr.slice(0, 8)}...${addrStr.slice(-6)}`;
}
