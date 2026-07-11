import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// extractVideoId — shared logic between client and API route
// ---------------------------------------------------------------------------

function extractVideoId(url: string): string | null {
  const patterns = [
    /vimeo\.com\/(\d+)(?:\/\S*)?$/,
    /player\.vimeo\.com\/video\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

test("extractVideoId from standard vimeo.com URL", () => {
  assert.equal(extractVideoId("https://vimeo.com/123456789"), "123456789");
});

test("extractVideoId from vimeo.com URL with hash", () => {
  assert.equal(
    extractVideoId("https://vimeo.com/994240189/cb0868a449"),
    "994240189",
  );
});

test("extractVideoId from player.vimeo.com URL", () => {
  assert.equal(
    extractVideoId("https://player.vimeo.com/video/123456789"),
    "123456789",
  );
});

test("extractVideoId from player.vimeo.com URL with query params", () => {
  assert.equal(
    extractVideoId("https://player.vimeo.com/video/123456789?badge=0&autopause=0"),
    "123456789",
  );
});

test("extractVideoId returns null for invalid URL", () => {
  assert.equal(extractVideoId("https://youtube.com/watch?v=abc"), null);
});

test("extractVideoId returns null for empty string", () => {
  assert.equal(extractVideoId(""), null);
});

test("extractVideoId returns null for vimeo.com without numeric ID", () => {
  assert.equal(extractVideoId("https://vimeo.com/categories"), null);
});

test("extractVideoId handles URL with trailing slash", () => {
  assert.equal(extractVideoId("https://vimeo.com/123456789/"), "123456789");
});

// ---------------------------------------------------------------------------
// LocalSessionSnapshot — vimeoVideoId
// ---------------------------------------------------------------------------

import {
  createLocalSessionSnapshot,
  parseLocalSessionSnapshot,
} from "../lib/local-session";

function makeTrack() {
  return {
    id: "t1",
    name: "Track 1",
    subtitles: [
      {
        uuid: "u1",
        id: 1,
        startTime: "00:00:01,000",
        endTime: "00:00:03,000",
        text: "Hello",
      },
    ],
  };
}

function makePrefs() {
  return {
    showTrackLabels: false,
    showSubtitleDuration: false,
    addSpaceOnMerge: false,
    clampOverlaps: true,
    playInBackground: false,
  };
}

test("createLocalSessionSnapshot includes vimeoVideoId", () => {
  const snapshot = createLocalSessionSnapshot({
    tracks: [makeTrack()],
    activeTrackId: "t1",
    preferences: makePrefs(),
    vimeoVideoId: "994240189",
  });
  assert.equal(snapshot.vimeoVideoId, "994240189");
});

test("createLocalSessionSnapshot omits vimeoVideoId when undefined", () => {
  const snapshot = createLocalSessionSnapshot({
    tracks: [makeTrack()],
    activeTrackId: "t1",
    preferences: makePrefs(),
  });
  assert.equal(snapshot.vimeoVideoId, undefined);
});

test("parseLocalSessionSnapshot restores vimeoVideoId", () => {
  const snapshot = createLocalSessionSnapshot({
    tracks: [makeTrack()],
    activeTrackId: "t1",
    preferences: makePrefs(),
    vimeoVideoId: "12345",
  });
  const parsed = parseLocalSessionSnapshot(JSON.stringify(snapshot));
  assert.equal(parsed?.vimeoVideoId, "12345");
});

test("parseLocalSessionSnapshot handles missing vimeoVideoId gracefully", () => {
  const snapshot = createLocalSessionSnapshot({
    tracks: [makeTrack()],
    activeTrackId: "t1",
    preferences: makePrefs(),
  });
  const raw = JSON.stringify(snapshot);
  const parsed = parseLocalSessionSnapshot(raw);
  assert.equal(parsed?.vimeoVideoId, undefined);
});
