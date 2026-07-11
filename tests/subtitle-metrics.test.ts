import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCueMetrics,
  computeTrackMetrics,
  METRICS_THRESHOLDS,
} from "../lib/subtitle-metrics";
import type { Subtitle } from "../types/subtitle";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub(
  overrides: Partial<Subtitle> & { startTime: string; endTime: string; text: string },
): Subtitle {
  return {
    uuid: overrides.uuid ?? "test-uuid",
    id: overrides.id ?? 1,
    startTime: overrides.startTime,
    endTime: overrides.endTime,
    text: overrides.text,
  };
}

// ---------------------------------------------------------------------------
// computeCueMetrics — basic math
// ---------------------------------------------------------------------------

test("computes duration correctly", () => {
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:01,000", endTime: "00:00:03,000", text: "hi" }),
    null,
    null,
  );
  assert.equal(cue.durationSeconds, 2);
});

test("computes charCount using Unicode-safe Array.from", () => {
  // 2-char emoji is 1 Unicode code point
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:02,000", text: "😀ab" }),
    null,
    null,
  );
  assert.equal(cue.charCount, 3);
});

test("computes word count ignoring leading/trailing whitespace", () => {
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:02,000", text: "  hello world  " }),
    null,
    null,
  );
  assert.equal(cue.wordCount, 2);
});

test("computes CPS correctly", () => {
  // 10 chars over 2 s = 5 CPS
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:02,000", text: "1234567890" }),
    null,
    null,
  );
  assert.equal(cue.cps, 5);
});

test("computes WPM correctly", () => {
  // 3 words over 1 s = 180 WPM
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:01,000", text: "one two three" }),
    null,
    null,
  );
  assert.equal(cue.wpm, 180);
});

// ---------------------------------------------------------------------------
// Zero-duration safety
// ---------------------------------------------------------------------------

test("zero-duration cue: CPS and WPM are 0, warns duration_short", () => {
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:01,000", endTime: "00:00:01,000", text: "text" }),
    null,
    null,
  );
  assert.equal(cue.cps, 0);
  assert.equal(cue.wpm, 0);
  assert.ok(cue.warnings.some((w) => w.kind === "duration_short"));
});

// ---------------------------------------------------------------------------
// Multi-line splitting
// ---------------------------------------------------------------------------

test("counts lines and measures max line length correctly", () => {
  const cue = computeCueMetrics(
    makeSub({
      startTime: "00:00:00,000",
      endTime: "00:00:02,000",
      text: "short\na much longer line here",
    }),
    null,
    null,
  );
  assert.equal(cue.lineCount, 2);
  assert.equal(cue.maxLineLength, "a much longer line here".length);
});

// ---------------------------------------------------------------------------
// Warning thresholds
// ---------------------------------------------------------------------------

test("warns duration_short when duration < 1s", () => {
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:00,500", text: "x" }),
    null,
    null,
  );
  assert.ok(cue.warnings.some((w) => w.kind === "duration_short"));
  assert.ok(!cue.warnings.some((w) => w.kind === "duration_long"));
});

test("warns duration_long when duration > 7s", () => {
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:08,000", text: "x" }),
    null,
    null,
  );
  assert.ok(cue.warnings.some((w) => w.kind === "duration_long"));
  assert.ok(!cue.warnings.some((w) => w.kind === "duration_short"));
});

test("does NOT warn duration when within thresholds", () => {
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:03,000", text: "hello world" }),
    null,
    null,
  );
  assert.ok(!cue.warnings.some((w) => w.kind === "duration_short"));
  assert.ok(!cue.warnings.some((w) => w.kind === "duration_long"));
});

test("warns cps_high when CPS > 20", () => {
  // 100 chars over 4 s = 25 CPS
  const cue = computeCueMetrics(
    makeSub({
      startTime: "00:00:00,000",
      endTime: "00:00:04,000",
      text: "a".repeat(100),
    }),
    null,
    null,
  );
  assert.ok(cue.warnings.some((w) => w.kind === "cps_high"));
});

test("does NOT warn cps_high when CPS <= 20", () => {
  // 40 chars over 4 s = 10 CPS
  const cue = computeCueMetrics(
    makeSub({
      startTime: "00:00:00,000",
      endTime: "00:00:04,000",
      text: "a".repeat(40),
    }),
    null,
    null,
  );
  assert.ok(!cue.warnings.some((w) => w.kind === "cps_high"));
});

test("warns wpm_high when WPM > 180", () => {
  // 4 words over 1 s = 240 WPM
  const cue = computeCueMetrics(
    makeSub({
      startTime: "00:00:00,000",
      endTime: "00:00:01,000",
      text: "one two three four",
    }),
    null,
    null,
  );
  assert.ok(cue.warnings.some((w) => w.kind === "wpm_high"));
});

test("warns line_length when a line exceeds 42 chars", () => {
  const cue = computeCueMetrics(
    makeSub({
      startTime: "00:00:00,000",
      endTime: "00:00:03,000",
      text: "a".repeat(43),
    }),
    null,
    null,
  );
  assert.ok(cue.warnings.some((w) => w.kind === "line_length"));
});

test("does NOT warn line_length when all lines are within 42 chars", () => {
  const cue = computeCueMetrics(
    makeSub({
      startTime: "00:00:00,000",
      endTime: "00:00:03,000",
      text: "a".repeat(42),
    }),
    null,
    null,
  );
  assert.ok(!cue.warnings.some((w) => w.kind === "line_length"));
});

test("warns too_many_lines when lineCount > 2", () => {
  const cue = computeCueMetrics(
    makeSub({
      startTime: "00:00:00,000",
      endTime: "00:00:03,000",
      text: "line one\nline two\nline three",
    }),
    null,
    null,
  );
  assert.ok(cue.warnings.some((w) => w.kind === "too_many_lines"));
});

// ---------------------------------------------------------------------------
// Empty text
// ---------------------------------------------------------------------------

test("empty text: wordCount=0, charCount=0, no text-related warnings", () => {
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:02,000", text: "" }),
    null,
    null,
  );
  assert.equal(cue.wordCount, 0);
  assert.equal(cue.charCount, 0);
  assert.ok(!cue.warnings.some((w) => w.kind === "cps_high"));
  assert.ok(!cue.warnings.some((w) => w.kind === "wpm_high"));
  assert.ok(!cue.warnings.some((w) => w.kind === "line_length"));
  assert.ok(!cue.warnings.some((w) => w.kind === "too_many_lines"));
});

// ---------------------------------------------------------------------------
// Gap computation
// ---------------------------------------------------------------------------

test("gapBefore is null for the first cue and correct for subsequent cues", () => {
  const cueFirst = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:02,000", text: "hi" }),
    null,
    5,
  );
  assert.equal(cueFirst.gapBefore, null);
  assert.equal(cueFirst.gapAfter, 3); // 5 - 2

  const cueSecond = computeCueMetrics(
    makeSub({ startTime: "00:00:05,000", endTime: "00:00:07,000", text: "hi" }),
    2, // previous end
    null,
  );
  assert.equal(cueSecond.gapBefore, 3); // 5 - 2
  assert.equal(cueSecond.gapAfter, null);
});

// ---------------------------------------------------------------------------
// Custom thresholds
// ---------------------------------------------------------------------------

test("respects custom thresholds", () => {
  const customThresholds = { ...METRICS_THRESHOLDS, maxCps: 5 };
  // 10 chars over 2 s = 5 CPS — equal to threshold, NOT over
  const cue = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:02,000", text: "1234567890" }),
    null,
    null,
    customThresholds,
  );
  assert.ok(!cue.warnings.some((w) => w.kind === "cps_high"));

  const customThresholds2 = { ...METRICS_THRESHOLDS, maxCps: 4 };
  const cue2 = computeCueMetrics(
    makeSub({ startTime: "00:00:00,000", endTime: "00:00:02,000", text: "1234567890" }),
    null,
    null,
    customThresholds2,
  );
  assert.ok(cue2.warnings.some((w) => w.kind === "cps_high"));
});

// ---------------------------------------------------------------------------
// computeTrackMetrics — track-level
// ---------------------------------------------------------------------------

const trackSubtitles: Subtitle[] = [
  {
    uuid: "t1",
    id: 1,
    startTime: "00:00:00,000",
    endTime: "00:00:02,000",
    text: "hello world",
  },
  {
    uuid: "t2",
    id: 2,
    startTime: "00:00:03,000",
    endTime: "00:00:05,000",
    text: "hello world",
  },
  {
    uuid: "t3",
    id: 3,
    startTime: "00:00:06,000",
    endTime: "00:00:08,000",
    // Long text to trigger line_length warning
    text: "a".repeat(50),
  },
];

test("track: totalCues is correct", () => {
  const tm = computeTrackMetrics(trackSubtitles);
  assert.equal(tm.totalCues, 3);
});

test("track: totalWords sums per-cue word counts", () => {
  const tm = computeTrackMetrics(trackSubtitles);
  // "hello world" = 2, "hello world" = 2, "aaa...a" = 1
  assert.equal(tm.totalWords, 5);
});

test("track: maxCps is the maximum CPS across all cues", () => {
  const tm = computeTrackMetrics(trackSubtitles);
  // cue3: 50 chars / 2s = 25 CPS
  assert.ok(tm.maxCps >= 25);
});

test("track: cuesWithWarnings counts cues that have at least one warning", () => {
  const tm = computeTrackMetrics(trackSubtitles);
  // cue3 has line_length warning; cue1 and cue2 also have duration within range
  assert.ok(tm.cuesWithWarnings >= 1);
});

test("track: mostRepeatedLines detects repeated lines", () => {
  const tm = computeTrackMetrics(trackSubtitles);
  const repeated = tm.mostRepeatedLines.find((r) => r.text === "hello world");
  assert.ok(repeated !== undefined);
  assert.equal(repeated?.count, 2);
});

test("track: topWords counts word frequencies", () => {
  const tm = computeTrackMetrics(trackSubtitles);
  // "hello" and "world" each appear in 2 cues, non-stop words
  const helloEntry = tm.topWords.find((w) => w.word === "hello");
  assert.ok(helloEntry !== undefined);
  assert.equal(helloEntry?.count, 2);
});

test("track: empty subtitle array returns zero totals", () => {
  const tm = computeTrackMetrics([]);
  assert.equal(tm.totalCues, 0);
  assert.equal(tm.totalWords, 0);
  assert.equal(tm.totalChars, 0);
  assert.equal(tm.maxCps, 0);
  assert.equal(tm.averageDuration, 0);
  assert.equal(tm.cuesWithWarnings, 0);
  assert.deepEqual(tm.mostRepeatedLines, []);
  assert.deepEqual(tm.topWords, []);
});

test("track: perCue gapBefore/gapAfter are wired through correctly", () => {
  const tm = computeTrackMetrics(trackSubtitles);
  // First cue: gapBefore = null, gapAfter = 3 - 2 = 1s
  assert.equal(tm.perCue[0].gapBefore, null);
  assert.equal(tm.perCue[0].gapAfter, 1);
  // Second cue: gapBefore = 3 - 2 = 1s, gapAfter = 6 - 5 = 1s
  assert.equal(tm.perCue[1].gapBefore, 1);
  assert.equal(tm.perCue[1].gapAfter, 1);
  // Last cue: gapAfter = null
  assert.equal(tm.perCue[2].gapAfter, null);
});
