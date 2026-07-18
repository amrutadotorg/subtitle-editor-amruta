const DB_NAME = "subtitle-editor-waveform-cache";
const DB_VERSION = 1;
const STORE_NAME = "peaks";

interface PeaksCacheEntry {
  peaks: number[]; // Float32Array serialized as plain number[]
  duration: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedPeaks(
  key: string,
): Promise<{ peaks: Float32Array[]; duration: number } | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const entry: PeaksCacheEntry | undefined = req.result;
        if (!entry) {
          resolve(null);
          return;
        }
        resolve({
          peaks: [new Float32Array(entry.peaks)],
          duration: entry.duration,
        });
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function setCachedPeaks(
  key: string,
  peaks: Float32Array,
  duration: number,
): Promise<void> {
  try {
    const db = await openDB();
    const entry: PeaksCacheEntry = {
      peaks: Array.from(peaks),
      duration,
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // IndexedDB unavailable — silent fail
  }
}
