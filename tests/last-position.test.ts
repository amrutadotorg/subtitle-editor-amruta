import test from "node:test";
import assert from "node:assert/strict";
import {
  LAST_POSITION_MAX_AGE_MS,
  LAST_POSITION_STORAGE_KEY,
  buildWorkspaceKey,
  clearLastPosition,
  parseLastPositionStore,
  parseResumeCandidate,
  pruneLastPositionStore,
  readLastPosition,
  readFreshestLastPosition,
  resolveResumeCandidate,
  resolveResumeUuid,
  selectResumeTrackId,
  writeLastPosition,
  type ResumeCandidate,
} from "../lib/last-position";

const createStorage = () => {
  const store = new Map<string, string>();
  return {
    adapter: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    store,
  };
};

const candidate = (
  overrides: Partial<ResumeCandidate> = {},
): ResumeCandidate => ({
  uuid: "cue-1",
  trackId: "track-1",
  cueIndex: 0,
  cueStart: 1,
  time: 1.5,
  updatedAt: Date.now(),
  ...overrides,
});

test("writeLastPosition and readLastPosition round-trip per workspace key", () => {
  const { adapter, store } = createStorage();

  assert.equal(
    writeLastPosition("track:english", candidate({ uuid: "cue-a" }), adapter),
    true,
  );
  assert.equal(
    writeLastPosition("track:spanish", candidate({ uuid: "cue-b" }), adapter),
    true,
  );

  assert.ok(store.has(LAST_POSITION_STORAGE_KEY));
  assert.equal(readLastPosition("track:english", adapter)?.uuid, "cue-a");
  assert.equal(readLastPosition("track:spanish", adapter)?.uuid, "cue-b");
  assert.equal(readLastPosition("track:missing", adapter), null);

  assert.equal(clearLastPosition("track:english", adapter), true);
  assert.equal(readLastPosition("track:english", adapter), null);
  assert.equal(readLastPosition("track:spanish", adapter)?.uuid, "cue-b");

  assert.equal(clearLastPosition(undefined, adapter), true);
  assert.equal(store.has(LAST_POSITION_STORAGE_KEY), false);
});

test("readFreshestLastPosition picks the newest candidate across tracks", () => {
  const { adapter } = createStorage();
  const now = Date.now();

  writeLastPosition(
    "track:a",
    candidate({ uuid: "a-1", updatedAt: now - 5000 }),
    adapter,
  );
  writeLastPosition(
    "track:b",
    candidate({ uuid: "b-1", updatedAt: now - 1000 }),
    adapter,
  );

  assert.equal(
    readFreshestLastPosition(["track:a", "track:b"], adapter)?.uuid,
    "b-1",
  );
  assert.equal(
    readFreshestLastPosition(["track:a", "track:missing"], adapter)?.uuid,
    "a-1",
  );
  assert.equal(readFreshestLastPosition([], adapter), null);
});

test("parseLastPositionStore rejects bad payloads but keeps valid entries", () => {
  assert.equal(parseLastPositionStore("not json"), null);
  assert.equal(
    parseLastPositionStore(JSON.stringify({ schemaVersion: 2, entries: {} })),
    null,
  );
  assert.equal(
    parseLastPositionStore(JSON.stringify({ schemaVersion: 1, entries: [] })),
    null,
  );

  const valid = candidate({ uuid: "cue-good" });
  const parsed = parseLastPositionStore(
    JSON.stringify({
      schemaVersion: 1,
      entries: {
        good: valid,
        badUuid: { ...valid, uuid: 42 },
        badNumbers: { ...valid, cueStart: Number.NaN },
        badTrack: { ...valid, trackId: 7 },
      },
    }),
  );

  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed.entries), ["good"]);
  assert.equal(parsed.entries.good.uuid, "cue-good");
});

test("parseResumeCandidate tolerates a missing trackId", () => {
  const parsed = parseResumeCandidate({
    uuid: "cue-1",
    cueIndex: 3,
    cueStart: 2,
    time: 2,
    updatedAt: 10,
  });

  assert.ok(parsed);
  assert.equal(parsed.trackId, null);
});

test("pruneLastPositionStore drops stale entries and keeps 10 newest", () => {
  const now = Date.now();
  const entries: Record<string, ResumeCandidate> = {
    stale: candidate({
      uuid: "stale",
      updatedAt: now - LAST_POSITION_MAX_AGE_MS - 1,
    }),
  };
  for (let index = 0; index < 12; index += 1) {
    entries[`key-${index}`] = candidate({
      uuid: `cue-${index}`,
      updatedAt: now - index * 1000,
    });
  }

  const pruned = pruneLastPositionStore({ schemaVersion: 1, entries }, now);
  const keys = Object.keys(pruned.entries);

  assert.equal(keys.length, 10);
  assert.equal(keys.includes("stale"), false);
  assert.equal(keys[0], "key-0");
  assert.equal(keys.includes("key-10"), false);
});

test("buildWorkspaceKey normalises track names", () => {
  assert.equal(
    buildWorkspaceKey({ trackName: " My File.VTT " }),
    "track:my file.vtt",
  );
  assert.equal(buildWorkspaceKey({ trackName: "   " }), "track:untitled");
  assert.equal(buildWorkspaceKey({ trackName: null }), "track:untitled");
});

test("resolveResumeCandidate picks the fresher record", () => {
  const storeCandidate = candidate({ uuid: "from-store", updatedAt: 500 });
  const snapshotCandidate = candidate({
    uuid: "from-snapshot",
    updatedAt: 400,
  });

  assert.equal(
    resolveResumeCandidate(storeCandidate, snapshotCandidate, 450)?.uuid,
    "from-store",
  );
  assert.equal(
    resolveResumeCandidate(storeCandidate, snapshotCandidate, 600)?.uuid,
    "from-snapshot",
  );
  // Tie against savedAt goes to the store key.
  assert.equal(
    resolveResumeCandidate(storeCandidate, snapshotCandidate, 500)?.uuid,
    "from-store",
  );

  assert.equal(
    resolveResumeCandidate(null, snapshotCandidate, 0)?.uuid,
    "from-snapshot",
  );
  assert.equal(
    resolveResumeCandidate(storeCandidate, undefined, 0)?.uuid,
    "from-store",
  );
  assert.equal(resolveResumeCandidate(null, undefined, 0), null);
});

test("resolveResumeUuid falls back from uuid to cueStart to cueIndex", () => {
  const timings = [
    { uuid: "a", start: 0 },
    { uuid: "b", start: 5 },
    { uuid: "c", start: 10 },
  ];

  assert.equal(
    resolveResumeUuid(
      candidate({ uuid: "c", cueStart: 10, cueIndex: 2 }),
      timings,
    ),
    "c",
  );

  // Deleted cue: nearest start within tolerance.
  assert.equal(
    resolveResumeUuid(
      candidate({ uuid: "gone", cueStart: 5.2, cueIndex: 0 }),
      timings,
    ),
    "b",
  );

  // Deleted cue, no start within tolerance: clamped cue index.
  assert.equal(
    resolveResumeUuid(
      candidate({ uuid: "gone", cueStart: 100, cueIndex: 1 }),
      timings,
    ),
    "b",
  );
  assert.equal(
    resolveResumeUuid(
      candidate({ uuid: "gone", cueStart: 100, cueIndex: 99 }),
      timings,
    ),
    "c",
  );
  assert.equal(
    resolveResumeUuid(
      candidate({ uuid: "gone", cueStart: 100, cueIndex: -5 }),
      timings,
    ),
    "a",
  );

  assert.equal(resolveResumeUuid(candidate(), []), null);
});

test("selectResumeTrackId prefers the stored position over the snapshot track", () => {
  const tracks = [
    { id: "track-a", subtitles: [{ uuid: "a-1" }, { uuid: "a-2" }] },
    { id: "track-b", subtitles: [{ uuid: "b-1" }] },
  ];

  // Position from another track wins when the cue still exists there.
  assert.equal(
    selectResumeTrackId(
      tracks,
      candidate({ trackId: "track-a", uuid: "a-2" }),
      "track-b",
    ),
    "track-a",
  );

  // Cue no longer exists in that track: fall back to the snapshot's track.
  assert.equal(
    selectResumeTrackId(
      tracks,
      candidate({ trackId: "track-a", uuid: "a-9" }),
      "track-b",
    ),
    "track-b",
  );

  // Track was removed entirely.
  assert.equal(
    selectResumeTrackId(
      tracks,
      candidate({ trackId: "track-gone", uuid: "x" }),
      "track-b",
    ),
    "track-b",
  );

  // No candidate, no valid fallback.
  assert.equal(selectResumeTrackId(tracks, null, null), "track-a");
  assert.equal(selectResumeTrackId([], null, "track-b"), null);
});
