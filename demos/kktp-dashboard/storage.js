// storage.js - Persistence layer (IndexedDB + LocalStorage)
const SESSION_STORAGE_KEY = "kktp:sessions";
const LAST_DISCOVERY_BLOCK_KEY = "kktp:lastDiscoveryBlockHash";
const LAST_SEEN_BLOCK_KEY = "kktp:lastSeenBlockHash";

let dashboardDbPromise = null;
let dashboardDbRecreatedOnce = false;

export function openDashboardDb() {
  if (dashboardDbPromise) return dashboardDbPromise;

  dashboardDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("KKTP_DB", 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("sessions")) {
        const store = db.createObjectStore("sessions", { keyPath: "sid" });
        store.createIndex("prefix", "prefix", { unique: false });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains("dashboard_snapshots")) {
        const store = db.createObjectStore("dashboard_snapshots", {
          keyPath: "id",
        });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains("peer_registry")) {
        const peerStore = db.createObjectStore("peer_registry", {
          keyPath: "peerPubSig",
        });
        peerStore.createIndex("baseIndex", "baseIndex", { unique: true });
        peerStore.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
      };

      const hasPeers = db.objectStoreNames.contains("peer_registry");
      const hasMeta = db.objectStoreNames.contains("meta");

      if ((!hasPeers || !hasMeta) && !dashboardDbRecreatedOnce) {
        dashboardDbRecreatedOnce = true;
        db.close();
        const del = indexedDB.deleteDatabase("KKTP_DB");
        del.onsuccess = () => {
          dashboardDbPromise = null;
          openDashboardDb().then(resolve).catch(reject);
        };
        del.onerror = () => reject(del.error);
        return;
      }

      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });

  return dashboardDbPromise;
}

export function getStoredDiscoveryBlockHash() {
  return (localStorage.getItem(LAST_DISCOVERY_BLOCK_KEY) || "").trim();
}

export function setStoredDiscoveryBlockHash(hash) {
  if (!hash) return;
  localStorage.setItem(LAST_DISCOVERY_BLOCK_KEY, hash);
}

/**
 * Get the last seen block hash (updated during DAG walks for progress tracking)
 */
export function getStoredLastSeenBlockHash() {
  return (localStorage.getItem(LAST_SEEN_BLOCK_KEY) || "").trim();
}

/**
 * Set the last seen block hash (updated during DAG walks)
 * @param {string} hash - 64-character block hash
 */
export function setStoredLastSeenBlockHash(hash) {
  if (!hash || typeof hash !== "string" || hash.length !== 64) return;
  localStorage.setItem(LAST_SEEN_BLOCK_KEY, hash);
}

/**
 * Clear the last seen block hash (for fresh start)
 */
export function clearStoredLastSeenBlockHash() {
  localStorage.removeItem(LAST_SEEN_BLOCK_KEY);
}

function getSessionStorageKeyForAddress(address, networkId) {
  const addrRaw = address ?? "unknown";
  const addr = String(addrRaw).toLowerCase();
  return `${SESSION_STORAGE_KEY}:${networkId}:${addr}`;
}

function getSessionStorageKey(networkId, walletAddress) {
  return getSessionStorageKeyForAddress(walletAddress, networkId);
}

export async function loadSessionSnapshot({ networkId, walletAddress }) {
  if (typeof indexedDB === "undefined") return null;

  const key = getSessionStorageKey(networkId, walletAddress);
  const fallbackKey = getSessionStorageKeyForAddress("unknown", networkId);
  console.info(
    "KKTP: loadSessionSnapshot",
    JSON.stringify({
      key,
      fallbackKey,
      walletAddress: walletAddress || null,
    }),
  );

  try {
    const db = await openDashboardDb();
    const snap = await new Promise((resolve, reject) => {
      const tx = db.transaction("dashboard_snapshots", "readonly");
      const store = tx.objectStore("dashboard_snapshots");
      const req = store.get(key);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (snap?.data) {
      const parsed = JSON.parse(snap.data);
      console.info(
        "KKTP: loadSessionSnapshot hit",
        JSON.stringify({
          key,
          savedAt: snap.savedAt || null,
          sessionCount: Array.isArray(parsed?.sessions)
            ? parsed.sessions.length
            : 0,
        }),
      );
      return parsed;
    }
  } catch {
    // ignore
  }

  if (!walletAddress) return null;

  try {
    const db = await openDashboardDb();
    const legacy = await new Promise((resolve, reject) => {
      const tx = db.transaction("dashboard_snapshots", "readonly");
      const store = tx.objectStore("dashboard_snapshots");
      const req = store.get(fallbackKey);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (legacy?.data) {
      const parsed = JSON.parse(legacy.data);
      console.info(
        "KKTP: loadSessionSnapshot legacy-hit",
        JSON.stringify({
          key: fallbackKey,
          savedAt: legacy.savedAt || null,
          sessionCount: Array.isArray(parsed?.sessions)
            ? parsed.sessions.length
            : 0,
        }),
      );
      await saveSessionSnapshot({
        networkId,
        walletAddress,
        snapshot: parsed,
      });
      return parsed;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function saveSessionSnapshot({ networkId, walletAddress, snapshot }) {
  if (typeof indexedDB === "undefined" || !snapshot) return;

  try {
    const key = walletAddress
      ? getSessionStorageKey(networkId, walletAddress)
      : getSessionStorageKeyForAddress("unknown", networkId);
    console.info(
      "KKTP: saveSessionSnapshot",
      JSON.stringify({
        key,
        sessionCount: Array.isArray(snapshot?.sessions)
          ? snapshot.sessions.length
          : 0,
        includeMessages: Array.isArray(snapshot?.sessions)
          ? snapshot.sessions.some((s) => (s?.messages || []).length > 0)
          : false,
      }),
    );
    const db = await openDashboardDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("dashboard_snapshots", "readwrite");
      const store = tx.objectStore("dashboard_snapshots");
      store.put({
        id: key,
        savedAt: Date.now(),
        data: JSON.stringify(snapshot),
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // no-op
  }
}
