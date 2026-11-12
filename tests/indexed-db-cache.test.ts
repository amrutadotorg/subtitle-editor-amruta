import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  clearLegacyVimeoCache,
  deleteDatabaseSafely,
} from "../lib/indexed-db-cache";

const VIMEO_DB = "subtitle-editor-vimeo-cache";
const PEAKS_DB = "subtitle-editor-waveform-cache";

const openDatabase = (name: string, storeName: string) =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const writeRecord = (db: IDBDatabase, storeName: string, key: string) =>
  new Promise<void>((resolve) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put({ value: key }, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });

const readKeys = (db: IDBDatabase, storeName: string) =>
  new Promise<IDBValidKey[]>((resolve) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAllKeys();
    tx.oncomplete = () => resolve(request.result);
  });

const databaseNames = () => indexedDB.databases?.() ?? Promise.resolve([]);

const hasDatabase = async (name: string) =>
  (await databaseNames()).some((info) => info.name === name);

test("clearLegacyVimeoCache removes the orphaned Vimeo database", async () => {
  const db = await openDatabase(VIMEO_DB, "files");
  await writeRecord(db, "files", "1");
  db.close();

  await clearLegacyVimeoCache();

  assert.equal(await hasDatabase(VIMEO_DB), false);
});

test("clearLegacyVimeoCache leaves the waveform peaks cache untouched", async () => {
  const vimeo = await openDatabase(VIMEO_DB, "files");
  await writeRecord(vimeo, "files", "1");
  vimeo.close();

  const peaks = await openDatabase(PEAKS_DB, "peaks");
  await writeRecord(peaks, "peaks", "local:v1:a.mp4:1:1");

  await clearLegacyVimeoCache();

  assert.equal(await hasDatabase(PEAKS_DB), true);
  assert.deepEqual(await readKeys(peaks, "peaks"), ["local:v1:a.mp4:1:1"]);
  peaks.close();
});

test("deleteDatabaseSafely resolves true for a database that never existed", async () => {
  assert.equal(
    await deleteDatabaseSafely("subtitle-editor-does-not-exist"),
    true,
  );
});

test("deleteDatabaseSafely resolves false when IndexedDB is unavailable", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", {
    value: undefined,
    configurable: true,
  });

  try {
    assert.equal(await deleteDatabaseSafely(VIMEO_DB), false);
    await assert.doesNotReject(clearLegacyVimeoCache());
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "indexedDB", descriptor);
    } else {
      delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    }
  }
});

test("deleteDatabaseSafely gives up on blocked deletes without hanging", async () => {
  const db = await openDatabase(VIMEO_DB, "files");

  const startedAt = Date.now();
  const deleted = await deleteDatabaseSafely(VIMEO_DB, 50);
  const elapsed = Date.now() - startedAt;

  assert.equal(deleted, false);
  assert.ok(elapsed < 1000, `delete should not hang (took ${elapsed}ms)`);

  db.close();
  await new Promise((resolve) => setTimeout(resolve, 50));
});
