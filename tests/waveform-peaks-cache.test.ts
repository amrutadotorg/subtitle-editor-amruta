import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeLocalMediaPeaksKey,
  getCachedPeaks,
  openDB,
  setCachedPeaks,
} from "../lib/waveform-peaks-cache";

const DB_NAME = "subtitle-editor-waveform-cache";
const STORE_NAME = "peaks";

const deleteDatabase = () =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

test("computeLocalMediaPeaksKey encodes name and includes size/lastModified", () => {
  const file = new File(["x"], "a:b.mp4", { lastModified: 42 });

  assert.equal(computeLocalMediaPeaksKey(file), "local:v1:a%3Ab.mp4:1:42");
  assert.equal(
    computeLocalMediaPeaksKey(new File(["x"], "a.mp4", { lastModified: 42 })),
    "local:v1:a.mp4:1:42",
  );
});

test("computeLocalMediaPeaksKey differs for name, size and lastModified", () => {
  const base = computeLocalMediaPeaksKey(
    new File(["x"], "a.mp4", { lastModified: 1 }),
  );

  assert.notEqual(
    base,
    computeLocalMediaPeaksKey(new File(["x"], "b.mp4", { lastModified: 1 })),
  );
  assert.notEqual(
    base,
    computeLocalMediaPeaksKey(new File(["xy"], "a.mp4", { lastModified: 1 })),
  );
  assert.notEqual(
    base,
    computeLocalMediaPeaksKey(new File(["x"], "a.mp4", { lastModified: 2 })),
  );
});

test("setCachedPeaks and getCachedPeaks round-trip a Float32Array", async () => {
  const peaks = new Float32Array([0, 0.25, 1]);

  await setCachedPeaks("round-trip", peaks, 12.5);
  const cached = await getCachedPeaks("round-trip");

  assert.ok(cached);
  assert.equal(cached.peaks.length, 1);
  assert.ok(cached.peaks[0] instanceof Float32Array);
  assert.deepEqual(Array.from(cached.peaks[0]), [0, 0.25, 1]);
  assert.equal(cached.duration, 12.5);
});

test("getCachedPeaks returns null for an unknown key", async () => {
  assert.equal(await getCachedPeaks("missing-key"), null);
});

test("getCachedPeaks tolerates legacy number[] entries", async () => {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(
      { peaks: [0, 0.5, 1], duration: 3 },
      "legacy-entry",
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();

  const cached = await getCachedPeaks("legacy-entry");
  assert.ok(cached);
  assert.ok(cached.peaks[0] instanceof Float32Array);
  assert.deepEqual(Array.from(cached.peaks[0]), [0, 0.5, 1]);
  assert.equal(cached.duration, 3);
});

test("setCachedPeaks never rejects when opening IndexedDB throws", async () => {
  const realIndexedDB = globalThis.indexedDB;
  try {
    Object.defineProperty(globalThis, "indexedDB", {
      value: {
        open() {
          throw new Error("boom");
        },
      },
      configurable: true,
      writable: true,
    });

    await assert.doesNotReject(
      setCachedPeaks("throwing-open", new Float32Array([1]), 1),
    );
    assert.equal(await getCachedPeaks("throwing-open"), null);
  } finally {
    Object.defineProperty(globalThis, "indexedDB", {
      value: realIndexedDB,
      configurable: true,
      writable: true,
    });
  }
});

test("cache degrades gracefully when IndexedDB is unavailable", async () => {
  const realIndexedDB = globalThis.indexedDB;
  try {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;

    assert.equal(await getCachedPeaks("no-idb"), null);
    await assert.doesNotReject(
      setCachedPeaks("no-idb", new Float32Array([1]), 1),
    );
  } finally {
    Object.defineProperty(globalThis, "indexedDB", {
      value: realIndexedDB,
      configurable: true,
      writable: true,
    });
  }
});

test("cache keeps at most 20 entries, evicting the oldest", async () => {
  await deleteDatabase();

  const realNow = Date.now;
  let clock = 1000;
  Date.now = () => clock++;

  try {
    for (let index = 0; index < 22; index += 1) {
      await setCachedPeaks(`lru-${index}`, new Float32Array([index]), index);
    }
  } finally {
    Date.now = realNow;
  }

  assert.equal(await getCachedPeaks("lru-0"), null);
  assert.equal(await getCachedPeaks("lru-1"), null);
  assert.ok(await getCachedPeaks("lru-2"));
  assert.ok(await getCachedPeaks("lru-21"));
});

test("upgrading from v1 clears legacy number[] entries", async () => {
  await deleteDatabase();

  // Simulate the v1 schema: store "peaks" holding number[] entries.
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = legacy.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ peaks: [0, 1], duration: 1 }, "v1-entry");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  legacy.close();

  // Opening at DB_VERSION 2 upgrades and clears the incompatible v1 entries.
  assert.equal(await getCachedPeaks("v1-entry"), null);

  await deleteDatabase();
});

test("openDB closes a stale connection on versionchange", async () => {
  const stale = await openDB();
  const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {};
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("upgrade blocked"));
  });

  try {
    assert.throws(
      () => stale.transaction(STORE_NAME, "readonly"),
      "stale connection should be closed after versionchange",
    );
  } finally {
    upgraded.close();
    stale.close();
    await deleteDatabase();
  }
});
