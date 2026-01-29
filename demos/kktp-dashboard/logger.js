// logger.js - Simple toggleable logger

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const DEFAULT_LEVEL = "info";
const STORAGE_KEY = "kktp:debug";

function parseBool(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getInitialEnabled() {
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("debug");
    if (param != null) return parseBool(param);
  } catch {
    // ignore
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored != null) return parseBool(stored);
  } catch {
    // ignore
  }

  return false;
}

function getInitialLevel() {
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("loglevel");
    if (param && Object.prototype.hasOwnProperty.call(LEVELS, param)) {
      return param;
    }
  } catch {
    // ignore
  }

  return DEFAULT_LEVEL;
}

class Logger {
  constructor({ enabled = false, level = DEFAULT_LEVEL } = {}) {
    this._enabled = !!enabled;
    this._level = Object.prototype.hasOwnProperty.call(LEVELS, level)
      ? level
      : DEFAULT_LEVEL;
  }

  setEnabled(enabled) {
    this._enabled = !!enabled;
  }

  setLevel(level) {
    if (Object.prototype.hasOwnProperty.call(LEVELS, level)) {
      this._level = level;
    }
  }

  get enabled() {
    return this._enabled;
  }

  get level() {
    return this._level;
  }

  debug(...args) {
    this._log("debug", ...args);
  }

  info(...args) {
    this._log("info", ...args);
  }

  warn(...args) {
    this._log("warn", ...args);
  }

  error(...args) {
    this._log("error", ...args);
  }

  _log(level, ...args) {
    if (!this._enabled) return;
    if (LEVELS[level] > LEVELS[this._level]) return;

    const method = console[level] || console.log;
    method(...args);
  }
}

export const logger = new Logger({
  enabled: getInitialEnabled(),
  level: getInitialLevel(),
});

export function setDebugLogging(enabled, level) {
  logger.setEnabled(enabled);
  if (level) logger.setLevel(level);

  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}
