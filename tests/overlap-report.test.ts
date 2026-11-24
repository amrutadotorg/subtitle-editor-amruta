import test from "node:test";
import assert from "node:assert/strict";
import {
  OVERLAP_PAIR_DISPLAY_LIMIT,
  buildOverlapPartnerMap,
  buildOverlapReport,
  buildTrackOverlapReport,
  limitOverlapPairs,
  needsOverlapConfirmation,
} from "../lib/overlap-report";
import { secondsToTime } from "../lib/utils";
import type { Subtitle, SubtitleTrack } from "../types/subtitle";

const makeSubtitle = (
  id: number,
  startTime: string,
  endTime: string,
  uuid = `uuid-${id}`,
): Subtitle => ({
  uuid,
  id,
  startTime,
  endTime,
  text: `Cue ${id}`,
});

const makeTrack = (id: string, subtitles: Subtitle[]): SubtitleTrack => ({
  id,
  name: id,
  subtitles,
});

const cueRef = (subtitle: Subtitle) => ({
  uuid: subtitle.uuid,
  id: subtitle.id,
  start: subtitle.startTime,
  end: subtitle.endTime,
});

// ---------------------------------------------------------------------------
// Pair detection
// ---------------------------------------------------------------------------

test("a track without collisions reports no pairs and zero counts", () => {
  const tracks = [
    makeTrack("t1", [
      makeSubtitle(1, "00:00:00,000", "00:00:02,000"),
      makeSubtitle(2, "00:00:05,000", "00:00:07,000"),
    ]),
  ];

  const report = buildOverlapReport(tracks);

  assert.deepEqual(report.pairs, []);
  assert.deepEqual(report.invalidTiming, []);
  assert.deepEqual(report.countsByTrack, {
    t1: { overlaps: 0, invalid: 0 },
  });
});

test("touching cues where end === start are not an overlap", () => {
  const first = makeSubtitle(1, "00:00:00,000", "00:00:02,000");
  const second = makeSubtitle(2, "00:00:02,000", "00:00:04,000");

  const report = buildOverlapReport([makeTrack("t1", [first, second])]);

  assert.deepEqual(report.pairs, []);
  assert.deepEqual(report.countsByTrack.t1, { overlaps: 0, invalid: 0 });
});

test("a one millisecond overlap is detected with an integer millisecond duration", () => {
  const first = makeSubtitle(1, "00:00:00,000", "00:00:02,001");
  const second = makeSubtitle(2, "00:00:02,000", "00:00:04,000");

  const report = buildOverlapReport([makeTrack("t1", [first, second])]);

  assert.deepEqual(report.pairs, [
    {
      trackId: "t1",
      a: cueRef(first),
      b: cueRef(second),
      overlapMs: 1,
    },
  ]);
  assert.deepEqual(report.countsByTrack.t1, { overlaps: 1, invalid: 0 });
});

test("a nested cue is reported once with the duration of the shared interval", () => {
  const outer = makeSubtitle(1, "00:00:00,000", "00:00:10,000");
  const inner = makeSubtitle(2, "00:00:02,000", "00:00:03,000");

  const report = buildOverlapReport([makeTrack("t1", [outer, inner])]);

  assert.equal(report.pairs.length, 1);
  assert.equal(report.pairs[0]?.a.uuid, outer.uuid);
  assert.equal(report.pairs[0]?.b.uuid, inner.uuid);
  assert.equal(report.pairs[0]?.overlapMs, 1000);
});

test("a chain A→B→C reports every colliding pair exactly once", () => {
  const a = makeSubtitle(1, "00:00:00,000", "00:00:10,000");
  const b = makeSubtitle(2, "00:00:01,000", "00:00:11,000");
  const c = makeSubtitle(3, "00:00:02,000", "00:00:12,000");

  const report = buildOverlapReport([makeTrack("t1", [a, b, c])]);

  const keys = report.pairs.map((pair) => `${pair.a.id}-${pair.b.id}`);
  assert.deepEqual(keys, ["1-2", "1-3", "2-3"]);
  assert.equal(report.countsByTrack.t1?.overlaps, 3);
});

test("one cue colliding with three others reports three pairs", () => {
  const long = makeSubtitle(1, "00:00:00,000", "00:00:10,000");
  const one = makeSubtitle(2, "00:00:01,000", "00:00:02,000");
  const two = makeSubtitle(3, "00:00:03,000", "00:00:04,000");
  const three = makeSubtitle(4, "00:00:05,000", "00:00:06,000");

  const report = buildOverlapReport([makeTrack("t1", [long, one, two, three])]);

  assert.deepEqual(
    report.pairs.map((pair) => `${pair.a.id}-${pair.b.id}:${pair.overlapMs}`),
    ["1-2:1000", "1-3:1000", "1-4:1000"],
  );
});

test("detection does not depend on the order of the input array", () => {
  const cues = [
    makeSubtitle(1, "00:00:00,000", "00:00:10,000"),
    makeSubtitle(2, "00:00:01,000", "00:00:02,000"),
    makeSubtitle(3, "00:00:02,000", "00:00:04,000"),
    makeSubtitle(4, "00:00:20,000", "00:00:21,000"),
  ];

  const sorted = buildOverlapReport([makeTrack("t1", cues)]);
  const shuffled = buildOverlapReport([
    makeTrack("t1", [cues[2], cues[0], cues[3], cues[1]]),
  ]);

  assert.deepEqual(shuffled, sorted);
});

// ---------------------------------------------------------------------------
// Per-track isolation and counters
// ---------------------------------------------------------------------------

test("overlaps in different tracks are reported separately and never paired", () => {
  const first = makeSubtitle(1, "00:00:00,000", "00:00:10,000");
  const second = makeSubtitle(2, "00:00:01,000", "00:00:02,000");
  const third = makeSubtitle(3, "00:00:03,000", "00:00:30,000");

  const report = buildOverlapReport([
    makeTrack("t1", [first, second]),
    makeTrack("t2", [third]),
  ]);

  assert.equal(report.pairs.length, 1);
  assert.equal(report.pairs[0]?.trackId, "t1");
  assert.deepEqual(report.countsByTrack, {
    t1: { overlaps: 1, invalid: 0 },
    t2: { overlaps: 0, invalid: 0 },
  });
});

// ---------------------------------------------------------------------------
// Invalid timing
// ---------------------------------------------------------------------------

test("cues with end <= start are invalid timing, never overlap pairs", () => {
  const normal = makeSubtitle(1, "00:00:06,000", "00:00:12,000");
  const reversed = makeSubtitle(2, "00:00:10,000", "00:00:05,000");
  const zeroLength = makeSubtitle(3, "00:00:07,000", "00:00:07,000");

  const report = buildOverlapReport([
    makeTrack("t1", [normal, reversed, zeroLength]),
  ]);

  assert.deepEqual(report.pairs, []);
  assert.deepEqual(
    report.invalidTiming.map((entry) => entry.cue.id),
    [3, 2],
  );
  assert.deepEqual(report.countsByTrack.t1, { overlaps: 0, invalid: 2 });
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

test("pairs are ordered chronologically by when the overlap starts", () => {
  const first = makeSubtitle(10, "00:00:00,000", "00:00:02,000");
  const second = makeSubtitle(11, "00:00:01,000", "00:00:01,500");
  const third = makeSubtitle(12, "00:00:05,000", "00:00:08,000");
  const fourth = makeSubtitle(13, "00:00:06,000", "00:00:07,000");
  const fifth = makeSubtitle(14, "00:00:20,000", "00:00:21,000");
  const sixth = makeSubtitle(15, "00:00:20,500", "00:00:20,900");

  const report = buildOverlapReport([
    makeTrack("t1", [fourth, first, sixth, third, second, fifth]),
  ]);

  assert.deepEqual(
    report.pairs.map((pair) => `${pair.a.id}-${pair.b.id}`),
    ["10-11", "12-13", "14-15"],
  );
});

// ---------------------------------------------------------------------------
// Presentation limit vs. full counters
// ---------------------------------------------------------------------------

test("the display limit stays at 100 while counters keep the full pair count", () => {
  const subtitles: Subtitle[] = [];
  for (let id = 1; id <= 15; id += 1) {
    subtitles.push(makeSubtitle(id, "00:00:00,000", "00:01:40,000"));
  }

  const report = buildOverlapReport([makeTrack("t1", subtitles)]);

  assert.equal(OVERLAP_PAIR_DISPLAY_LIMIT, 100);
  assert.equal(report.pairs.length, 105);
  assert.deepEqual(report.countsByTrack.t1, { overlaps: 105, invalid: 0 });
});

// ---------------------------------------------------------------------------
// Per-track API
// ---------------------------------------------------------------------------

test("the per-track report exposes its own counts without the other tracks", () => {
  const track = makeTrack("t1", [
    makeSubtitle(1, "00:00:00,000", "00:00:02,000"),
    makeSubtitle(2, "00:00:01,000", "00:00:03,000"),
    makeSubtitle(3, "00:00:05,000", "00:00:04,000"),
  ]);

  const result = buildTrackOverlapReport(track);

  assert.equal(result.pairs.length, 1);
  assert.deepEqual(
    result.invalidTiming.map((entry) => entry.cue.id),
    [3],
  );
  assert.deepEqual(result.counts, { overlaps: 1, invalid: 1 });
});

// ---------------------------------------------------------------------------
// Per-cue partner view
// ---------------------------------------------------------------------------

test("the partner map lists every collision from both cues of a pair", () => {
  const a = makeSubtitle(1, "00:00:00,000", "00:00:10,000");
  const b = makeSubtitle(2, "00:00:01,000", "00:00:11,000");
  const c = makeSubtitle(3, "00:00:02,000", "00:00:12,000");
  const isolated = makeSubtitle(4, "00:01:00,000", "00:01:01,000");

  const report = buildOverlapReport([makeTrack("t1", [a, b, c, isolated])]);
  const partners = buildOverlapPartnerMap(report);

  assert.deepEqual(
    partners[a.uuid]?.map((partner) => partner.cue.id),
    [2, 3],
  );
  assert.deepEqual(
    partners[b.uuid]?.map((partner) => partner.cue.id),
    [1, 3],
  );
  assert.deepEqual(
    partners[c.uuid]?.map((partner) => partner.cue.id),
    [1, 2],
  );
  assert.equal(partners[isolated.uuid], undefined);
  assert.equal(partners[b.uuid]?.[0]?.overlapMs, 9000);
});

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

test("a 5000 cue track with one neighbour overlap per cue reports 4999 pairs", () => {
  const subtitles: Subtitle[] = [];
  for (let index = 0; index < 5000; index += 1) {
    const start = index * 2.5;
    subtitles.push(
      makeSubtitle(index + 1, secondsToTime(start), secondsToTime(start + 3)),
    );
  }

  const report = buildOverlapReport([makeTrack("t1", subtitles)]);

  assert.equal(report.pairs.length, 4999);
  assert.deepEqual(report.countsByTrack.t1, { overlaps: 4999, invalid: 0 });
  assert.equal(report.pairs[0]?.overlapMs, 500);
  assert.equal(report.pairs.at(-1)?.overlapMs, 500);
});

// ---------------------------------------------------------------------------
// Save-dialog policy
// ---------------------------------------------------------------------------

test("only SRT and VTT need confirmation, and only with overlaps", () => {
  const overlapping = { overlaps: 2, invalid: 0 };
  const clean = { overlaps: 0, invalid: 3 };

  assert.equal(needsOverlapConfirmation("srt", overlapping), true);
  assert.equal(needsOverlapConfirmation("vtt", overlapping), true);
  assert.equal(needsOverlapConfirmation("txt", overlapping), false);
  assert.equal(needsOverlapConfirmation("csv", overlapping), false);

  assert.equal(needsOverlapConfirmation("srt", clean), false);
  assert.equal(needsOverlapConfirmation("vtt", clean), false);
  assert.equal(needsOverlapConfirmation("srt", undefined), false);
});

test("the pair display cap keeps the hidden count for the more-pairs line", () => {
  // Every cue lasts 3 s and starts 2 s after the previous one, so each cue
  // overlaps exactly its successor: N cues give N - 1 pairs.
  const pairs = buildOverlapReport([
    makeTrack(
      "t1",
      Array.from({ length: OVERLAP_PAIR_DISPLAY_LIMIT + 2 }, (_, index) =>
        makeSubtitle(
          index + 1,
          secondsToTime(index * 2),
          secondsToTime(index * 2 + 3),
        ),
      ),
    ),
  ]).pairs;
  assert.equal(pairs.length, OVERLAP_PAIR_DISPLAY_LIMIT + 1);

  const { displayed, hiddenCount } = limitOverlapPairs(pairs);

  assert.equal(displayed.length, OVERLAP_PAIR_DISPLAY_LIMIT);
  assert.equal(hiddenCount, pairs.length - OVERLAP_PAIR_DISPLAY_LIMIT);
  assert.deepEqual(limitOverlapPairs([]), { displayed: [], hiddenCount: 0 });
});
