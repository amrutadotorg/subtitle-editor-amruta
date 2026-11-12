import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderHook, waitFor } from "@testing-library/react";
import { useLegacyCacheCleanup } from "../hooks/use-legacy-cache-cleanup";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
const { window } = dom;

globalThis.window = window as unknown as typeof globalThis.window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", {
  value: window.navigator,
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const VIMEO_DB = "subtitle-editor-vimeo-cache";

const createVimeoDatabase = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(VIMEO_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("files");
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });

const hasDatabase = async (name: string) =>
  ((await indexedDB.databases?.()) ?? []).some((info) => info.name === name);

test("useLegacyCacheCleanup removes the orphaned Vimeo database on mount", async () => {
  await createVimeoDatabase();
  assert.equal(await hasDatabase(VIMEO_DB), true);

  renderHook(() => useLegacyCacheCleanup());

  await waitFor(async () => {
    assert.equal(await hasDatabase(VIMEO_DB), false);
  });
});

test("useLegacyCacheCleanup is a no-op when the database is already gone", async () => {
  assert.equal(await hasDatabase(VIMEO_DB), false);

  assert.doesNotThrow(() => renderHook(() => useLegacyCacheCleanup()));

  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await hasDatabase(VIMEO_DB), false);
});
