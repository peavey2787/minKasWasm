// logPanel.js - Event log panel rendering
import { elements } from "../dom.js";

/**
 * Log an event to the event log panel
 */
export function logEvent(message, type = "info") {
  const log = elements.eventLog;
  if (!log) return;

  const time = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry log-${type}`;
  entry.textContent = `[${time}] ${message}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

/**
 * Clear the event log
 */
export function clearEventLog() {
  const log = elements.eventLog;
  if (log) log.innerHTML = "";
}
