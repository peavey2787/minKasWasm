// walletDisplay.js - Wallet address and balance displays
import { elements } from "../dom.js";
import { truncateAddress } from "./helpers.js";

/**
 * Update wallet address display (truncated)
 */
export function updateWalletAddress(address) {
  const el = elements.walletAddress;
  if (!el) return;

  if (address) {
    el.textContent = `Address: ${truncateAddress(address)}`;
    el.title = address;
    el.classList.remove("wallet-address-wrap");
  } else {
    el.textContent = "Address: —";
    el.title = "";
    el.classList.remove("wallet-address-wrap");
  }
}

/**
 * Show the full wallet address (wrapped) for manual copy.
 */
export function showFullWalletAddress(address) {
  const el = elements.walletAddress;
  if (!el) return;
  if (!address) {
    el.textContent = "Address: —";
    el.title = "";
    el.classList.remove("wallet-address-wrap");
    return;
  }
  el.textContent = `Address: ${address}`;
  el.title = address;
  el.classList.add("wallet-address-wrap");
}

/**
 * Update wallet balance display
 */
export function updateWalletBalance(balanceText) {
  const el = elements.walletBalance;
  if (!el) return;

  if (balanceText) {
    el.textContent = `Balance: ${balanceText} KAS`;
  } else {
    el.textContent = "Balance: —";
  }
}

/**
 * Update copy button feedback
 */
export function setCopyStatus(text, isDisabled = false) {
  const btn = elements.btnCopyAddress;
  if (!btn) return;
  btn.textContent = text;
  btn.disabled = isDisabled;
}
