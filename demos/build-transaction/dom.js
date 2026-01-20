export const $ = (id) => document.getElementById(id);

export function setBadge(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  if (cls) {
    el.classList.remove('connected', 'disconnected', 'pending');
    el.classList.add(cls);
  }
}

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

export function appendLog(id, line, { clear = false } = {}) {
  const el = $(id);
  if (!el) return;
  if (clear) el.textContent = '';
  const ts = new Date().toISOString().slice(11, 19);
  el.textContent += `[${ts}] ${line}\n`;
  el.scrollTop = el.scrollHeight;
}

export function downloadJson(filename, data) {
  const json = JSON.stringify(data, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
