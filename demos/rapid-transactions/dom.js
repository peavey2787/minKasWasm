export const $ = (id) => document.getElementById(id);

export function setStatus(text, cls = 'pending') {
  const el = $('status');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('connected', 'disconnected', 'pending');
  el.classList.add(cls);
}

export function setText(id, value) {
  const el = $(id);
  if (!el) return;
  el.textContent = value;
}

export function logLine(msg) {
  const el = $('log');
  const ts = new Date().toISOString().slice(11, 19);
  if (el) {
    el.textContent = `[${ts}] ${msg}\n` + el.textContent;
  }
  try { console.log(msg); } catch { /* ignore */ }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
