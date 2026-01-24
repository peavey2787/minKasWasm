// Simple structured logger for core
export function logInfo(msg, meta) {
  console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, meta || "");
}
export function logError(msg, meta) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, meta || "");
}
