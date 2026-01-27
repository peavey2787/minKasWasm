export class SessionPersistence {
  constructor({
    dbName = "KKTP_DB",
    version = 2,
    sessionStore = "sessions",
    snapshotStore = "dashboard_snapshots",
  } = {}) {
    this.dbName = dbName;
    this.version = version;
    this.sessionStore = sessionStore;
    this.snapshotStore = snapshotStore;
    this._dbPromise = null;
  }

  async putResumeRecord(record) {
    if (typeof indexedDB === "undefined") return false;
    const db = await this._openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(this.sessionStore, "readwrite");
      const store = tx.objectStore(this.sessionStore);
      store.put(record);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async getResumeRecord(prefix, sid) {
    if (typeof indexedDB === "undefined" || !sid) return null;
    const db = await this._openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(this.sessionStore, "readonly");
      const store = tx.objectStore(this.sessionStore);
      const req = store.get(sid);

      req.onsuccess = () => {
        const rec = req.result;
        if (rec && rec.prefix === prefix) resolve(rec);
        else resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteResumeRecord(sid) {
    if (typeof indexedDB === "undefined" || !sid) return false;
    const db = await this._openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(this.sessionStore, "readwrite");
      const store = tx.objectStore(this.sessionStore);
      store.delete(sid);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async findLatestResumeRecord(prefix) {
    if (typeof indexedDB === "undefined") return null;
    const db = await this._openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(this.sessionStore, "readonly");
      const store = tx.objectStore(this.sessionStore);
      const index = store.index("prefix");

      let best = null;
      const req = index.openCursor(IDBKeyRange.only(prefix));

      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(best);
          return;
        }

        const rec = cursor.value;
        if (rec && (!best || (rec.savedAt || 0) > (best.savedAt || 0))) {
          best = rec;
        }

        cursor.continue();
      };

      req.onerror = () => reject(req.error);
    });
  }

  async _openDb() {
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.sessionStore)) {
          const store = db.createObjectStore(this.sessionStore, {
            keyPath: "sid",
          });
          store.createIndex("prefix", "prefix", { unique: false });
          store.createIndex("savedAt", "savedAt", { unique: false });
        }
        if (
          this.snapshotStore &&
          !db.objectStoreNames.contains(this.snapshotStore)
        ) {
          const snapshotStore = db.createObjectStore(this.snapshotStore, {
            keyPath: "id",
          });
          snapshotStore.createIndex("savedAt", "savedAt", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this._dbPromise;
  }
}
