const DB_NAME = "subtitle-editor-waveform-cache";
const DB_VERSION = 2;
const STORE_NAME = "peaks";
const MAX_CACHE_ENTRIES = 20;

/**
 * Version of the peak-generation algorithm (see `POINTS_PER_SECOND` in
 * `lib/audio-peaks.ts`). Bump it whenever the decoded peak shape changes so
 * stale entries are never reused.
 */
const PEAKS_ALGORITHM_VERSION = "v1";

interface PeaksCacheEntry {
  peaks: Float32Array; // structured clone supports Float32Array
  duration: number;
  updatedAt: number;
}

/**
 * Stable cache key for a local media file. The file name is URI-encoded
 * because it may itself contain `:`.
 */
export function computeLocalMediaPeaksKey(file: File): string {
  return `local:${PEAKS_ALGORITHM_VERSION}:${encodeURIComponent(file.name)}:${file.size}:${file.lastModified}`;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      // Reading `indexedDB` itself can throw a SecurityError (private mode).
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (event.oldVersion > 0 && event.oldVersion < 2) {
        // v1 stored peaks as plain number[] — incompatible with Float32Array.
        request.transaction?.objectStore(STORE_NAME).clear();
      }
    };
    // Another tab holds a queued deleteDatabase/open with a newer version.
    // Reject instead of hanging forever.
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedPeaks(
  key: string,
): Promise<{ peaks: Float32Array[]; duration: number } | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const close = () => db.close();
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        tx.oncomplete = close;
        tx.onabort = close;
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => {
          const entry: PeaksCacheEntry | undefined = req.result;
          if (!entry) {
            resolve(null);
            return;
          }
          // Tolerate legacy entries that stored peaks as number[].
          const peaks = Array.isArray(entry.peaks)
            ? new Float32Array(entry.peaks)
            : entry.peaks;
          if (!(peaks instanceof Float32Array)) {
            resolve(null);
            return;
          }
          resolve({ peaks: [peaks], duration: entry.duration });
        };
        req.onerror = () => resolve(null);
      } catch {
        close();
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

/**
 * Best-effort write: never rejects, so callers can fire and forget.
 */
export async function setCachedPeaks(
  key: string,
  peaks: Float32Array,
  duration: number,
): Promise<void> {
  try {
    const db = await openDB();
    try {
      const entry: PeaksCacheEntry = {
        peaks,
        duration,
        updatedAt: Date.now(),
      };
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onabort = () => resolve();
        tx.onerror = () => resolve();
        tx.objectStore(STORE_NAME).put(entry, key);
      });
      await pruneCachedPeaks(db);
    } finally {
      db.close();
    }
  } catch {
    // IndexedDB unavailable / quota exceeded — cache is best-effort.
  }
}

/**
 * LRU eviction: keeps only the `maxEntries` newest entries (by `updatedAt`).
 * Best-effort — failures are swallowed.
 */
async function pruneCachedPeaks(
  db: IDBDatabase,
  maxEntries = MAX_CACHE_ENTRIES,
): Promise<void> {
  try {
    const records = await new Promise<
      { key: IDBValidKey; updatedAt: number }[]
    >((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();
      tx.oncomplete = () => {
        const keys = keysRequest.result;
        const values = valuesRequest.result as PeaksCacheEntry[];
        resolve(
          keys.map((key, index) => ({
            key,
            updatedAt: Number(values[index]?.updatedAt) || 0,
          })),
        );
      };
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });

    if (records.length <= maxEntries) return;

    const stale = records
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, records.length - maxEntries);

    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const record of stale) {
        store.delete(record.key);
      }
      tx.oncomplete = () => resolve();
      tx.onabort = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Best-effort prune.
  }
}
