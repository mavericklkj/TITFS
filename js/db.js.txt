// IndexedDB wrapper — stores trades (with embedded image blobs)
const DB = (() => {
  const NAME = "tradeJournal";
  const VERSION = 1;
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains("trades"))
          d.createObjectStore("trades", { keyPath: "id" });
        if (!d.objectStoreNames.contains("meta"))
          d.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode = "readonly") {
    return db.transaction(store, mode).objectStore(store);
  }

  const trades = {
    all() {
      return new Promise((res, rej) => {
        const r = tx("trades").getAll();
        r.onsuccess = () => res(r.result.sort((a, b) =>
          (b.entryTime || "").localeCompare(a.entryTime || "")));
        r.onerror = () => rej(r.error);
      });
    },
    put(trade) {
      return new Promise((res, rej) => {
        const r = tx("trades", "readwrite").put(trade);
        r.onsuccess = () => res(trade);
        r.onerror = () => rej(r.error);
      });
    },
    get(id) {
      return new Promise((res, rej) => {
        const r = tx("trades").get(id);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    remove(id) {
      return new Promise((res, rej) => {
        const r = tx("trades", "readwrite").delete(id);
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    },
    clear() {
      return new Promise((res, rej) => {
        const r = tx("trades", "readwrite").clear();
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    }
  };

  const meta = {
    get(key, fallback) {
      return new Promise((res) => {
        const r = tx("meta").get(key);
        r.onsuccess = () => res(r.result ? r.result.value : fallback);
        r.onerror = () => res(fallback);
      });
    },
    set(key, value) {
      return new Promise((res, rej) => {
        const r = tx("meta", "readwrite").put({ key, value });
        r.onsuccess = () => res();
        r.onerror = () => rej(r.error);
      });
    }
  };

  return { open, trades, meta };
})();