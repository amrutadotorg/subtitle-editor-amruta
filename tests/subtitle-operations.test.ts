import test from "node:test";
import assert from "node:assert/strict";
import { addSubtitle, mergeSubtitles } from "../lib/subtitle-operations";
import type { Subtitle } from "../types/subtitle";

const baseSubtitles: Subtitle[] = [
  {
    uuid: "merge-1",
    id: 1,
    startTime: "00:00:00,000",
    endTime: "00:00:02,000",
    text: "Hello",
  },
  {
    uuid: "merge-2",
    id: 2,
    startTime: "00:00:02,000",
    endTime: "00:00:04,000",
    text: "world",
  },
];

test("mergeSubtitles keeps existing no-space behavior by default", () => {
  const merged = mergeSubtitles(baseSubtitles, 1, 2);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "Helloworld");
});

test("mergeSubtitles adds one separator space when enabled", () => {
  const merged = mergeSubtitles(baseSubtitles, 1, 2, {
    addSpaceBetweenTexts: true,
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "Hello world");
});

test("mergeSubtitles does not duplicate trailing whitespace", () => {
  const merged = mergeSubtitles(
    [
      { ...baseSubtitles[0], text: "Hello " },
      { ...baseSubtitles[1], text: "world" },
    ],
    1,
    2,
    { addSpaceBetweenTexts: true },
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "Hello world");
});

test("mergeSubtitles does not duplicate leading whitespace", () => {
  const merged = mergeSubtitles(
    [
      { ...baseSubtitles[0], text: "Hello" },
      { ...baseSubtitles[1], text: " world" },
    ],
    1,
    2,
    { addSpaceBetweenTexts: true },
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "Hello world");
});

const gapSubtitles: Subtitle[] = [
  {
    uuid: "gap-1",
    id: 1,
    startTime: "00:00:00,000",
    endTime: "00:00:02,000",
    text: "First",
  },
  {
    uuid: "gap-2",
    id: 2,
    startTime: "00:00:10,000",
    endTime: "00:00:12,000",
    text: "Second",
  },
];

test("addSubtitle fills entire gap without durationHint", () => {
  const result = addSubtitle(gapSubtitles, 1, 2, "New");

  assert.equal(result.length, 3);
  assert.equal(result[1].startTime, "00:00:02,000");
  assert.equal(result[1].endTime, "00:00:10,000");
});

test("addSubtitle with durationHint uses fixed duration when gap is large enough", () => {
  const result = addSubtitle(gapSubtitles, 1, 2, "New", 3);

  assert.equal(result.length, 3);
  assert.equal(result[1].startTime, "00:00:02,000");
  assert.equal(result[1].endTime, "00:00:05,000");
});

test("addSubtitle with durationHint fills entire gap when gap is smaller than hint", () => {
  const smallGapSubtitles: Subtitle[] = [
    {
      uuid: "small-1",
      id: 1,
      startTime: "00:00:00,000",
      endTime: "00:00:02,000",
      text: "First",
    },
    {
      uuid: "small-2",
      id: 2,
      startTime: "00:00:04,000",
      endTime: "00:00:06,000",
      text: "Second",
    },
  ];

  const result = addSubtitle(smallGapSubtitles, 1, 2, "New", 3);

  assert.equal(result.length, 3);
  assert.equal(result[1].startTime, "00:00:02,000");
  assert.equal(result[1].endTime, "00:00:04,000");
});
