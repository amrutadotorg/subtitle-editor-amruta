import test from "node:test";
import assert from "node:assert/strict";
// Must precede component imports so Radix portals mount synchronously.
import { cleanup, fireEvent, renderWithIntl, within } from "./helpers/render";
import { createElement } from "react";
import OverlapReportDialog from "../components/overlap-report/overlap-report-dialog";
import {
  OVERLAP_PAIR_DISPLAY_LIMIT,
  type OverlapReport,
  type OverlapPair,
} from "../lib/overlap-report";
import { secondsToTime } from "../lib/utils";
import type { SubtitleTrack } from "../types/subtitle";
import messages from "../messages/en.json";

const makeTrack = (id: string, name: string): SubtitleTrack => ({
  id,
  name,
  subtitles: [],
});

const makePair = (
  trackId: string,
  a: OverlapPair["a"],
  b: OverlapPair["b"],
  overlapMs: number,
): OverlapPair => ({ trackId, a, b, overlapMs });

const makeReport = ({
  pairs = [],
  invalidTiming = [],
}: {
  pairs?: OverlapPair[];
  invalidTiming?: OverlapReport["invalidTiming"];
}): OverlapReport => {
  const countsByTrack: OverlapReport["countsByTrack"] = {};
  const ensureCounts = (trackId: string) => {
    countsByTrack[trackId] ??= { overlaps: 0, invalid: 0 };
    return countsByTrack[trackId];
  };
  for (const pair of pairs) {
    ensureCounts(pair.trackId).overlaps += 1;
  }
  for (const entry of invalidTiming) {
    ensureCounts(entry.trackId).invalid += 1;
  }
  return { pairs, invalidTiming, countsByTrack };
};

const englishTrack = makeTrack("track-english", "English");

const pairA = {
  uuid: "uuid-12",
  id: 12,
  start: "00:01:00,000",
  end: "00:01:04,000",
};
const pairB = {
  uuid: "uuid-13",
  id: 13,
  start: "00:01:03,000",
  end: "00:01:05,000",
};
const invalidCue = {
  uuid: "uuid-14",
  id: 14,
  start: "00:00:10,000",
  end: "00:00:10,000",
};

const sampleReport = makeReport({
  pairs: [makePair("track-english", pairA, pairB, 1000)],
  invalidTiming: [{ trackId: "track-english", cue: invalidCue }],
});

interface RenderOptions {
  report: OverlapReport;
  tracks?: SubtitleTrack[];
  onNavigate?: (trackId: string, uuid: string) => void;
  onOpenChange?: (open: boolean) => void;
}

const renderDialog = ({
  report,
  tracks = [englishTrack],
  onNavigate = () => {},
  onOpenChange = () => {},
}: RenderOptions) =>
  renderWithIntl(
    createElement(OverlapReportDialog, {
      open: true,
      onOpenChange,
      report,
      tracks,
      onNavigate,
    }),
  );

const formatCueRange = (start: string, end: string) =>
  messages.overlaps.cueRange.replace("{start}", start).replace("{end}", end);

const formatOverlapSeconds = (overlapMs: number) =>
  messages.overlaps.overlapDuration.replace(
    "{value}",
    (overlapMs / 1000).toFixed(3),
  );

test.afterEach(() => cleanup());

test("report dialog renders a track section with pair ranges and overlap duration", () => {
  const view = renderDialog({ report: sampleReport });

  view.getByRole("dialog");
  view.getByText(messages.overlaps.reportTitle);
  view.getByText(messages.overlaps.reportDescription);

  const section = view.getByRole("region", { name: "English" });
  const text = section.textContent ?? "";
  assert.ok(text.includes("1 overlap"));
  assert.ok(text.includes("1 invalid cue"));

  view.getByText(formatCueRange(pairA.start, pairA.end));
  view.getByText(formatCueRange(pairB.start, pairB.end));
  view.getByText(formatOverlapSeconds(1000));
  view.getByText(messages.overlaps.pairsSection);
});

test("report dialog lists cues with invalid timing separately", () => {
  const view = renderDialog({ report: sampleReport });

  const section = view.getByRole("region", { name: "English" });
  const text = section.textContent ?? "";
  assert.ok(text.includes(messages.overlaps.invalidSection));
  assert.ok(text.includes(messages.overlaps.invalidCue));
  view.getByText(formatCueRange(invalidCue.start, invalidCue.end));
  view.getByRole("button", { name: /#14/ });
});

test("clicking a cue number navigates with its track and cue, then closes", () => {
  const navigations: Array<[string, string]> = [];
  const openChanges: boolean[] = [];
  const view = renderDialog({
    report: sampleReport,
    onNavigate: (trackId, uuid) => {
      navigations.push([trackId, uuid]);
    },
    onOpenChange: (open) => {
      openChanges.push(open);
    },
  });

  const cueButton = view.getByRole("button", {
    name: messages.overlaps.goToCue
      .replace("{id}", "13")
      .replace("{track}", "English"),
  });
  assert.equal(cueButton.tagName, "BUTTON");
  assert.equal(cueButton.hasAttribute("disabled"), false);

  cueButton.focus();
  assert.equal(document.activeElement, cueButton, "cue must be focusable");

  fireEvent.click(cueButton);

  assert.deepEqual(navigations, [["track-english", "uuid-13"]]);
  assert.deepEqual(openChanges, [false]);
});

test("report dialog shows only the first 100 pairs but the full counts", () => {
  const tracks = [makeTrack("track-many", "Many")];
  const pairs: OverlapPair[] = [];
  for (let index = 0; index < OVERLAP_PAIR_DISPLAY_LIMIT + 5; index += 1) {
    const start = index * 2;
    pairs.push(
      makePair(
        "track-many",
        {
          uuid: `a-${index}`,
          id: index * 2 + 1,
          start: secondsToTime(start),
          end: secondsToTime(start + 2),
        },
        {
          uuid: `b-${index}`,
          id: index * 2 + 2,
          start: secondsToTime(start + 1),
          end: secondsToTime(start + 3),
        },
        1000,
      ),
    );
  }
  const report = makeReport({ pairs });
  const view = renderDialog({ report, tracks });

  const renderedPairs = view.baseElement.querySelectorAll(
    "[data-overlap-pair]",
  );
  assert.equal(renderedPairs.length, OVERLAP_PAIR_DISPLAY_LIMIT);

  const sectionText =
    view.getByRole("region", { name: "Many" }).textContent ?? "";
  assert.ok(
    sectionText.includes(`${OVERLAP_PAIR_DISPLAY_LIMIT + 5} overlaps`),
    "track heading must show the full pair count",
  );

  view.getByText("…and 5 more");
});

test("report dialog caps pairs per track so a later track keeps its rows", () => {
  const manyPairs: OverlapPair[] = [];
  for (let index = 0; index < OVERLAP_PAIR_DISPLAY_LIMIT + 2; index += 1) {
    const start = index * 2;
    manyPairs.push(
      makePair(
        "track-many",
        {
          uuid: `many-a-${index}`,
          id: index * 2 + 1,
          start: secondsToTime(start),
          end: secondsToTime(start + 2),
        },
        {
          uuid: `many-b-${index}`,
          id: index * 2 + 2,
          start: secondsToTime(start + 1),
          end: secondsToTime(start + 3),
        },
        1000,
      ),
    );
  }
  const fewPair = makePair(
    "track-few",
    {
      uuid: "few-a",
      id: 901,
      start: "00:20:00,000",
      end: "00:20:04,000",
    },
    {
      uuid: "few-b",
      id: 902,
      start: "00:20:03,000",
      end: "00:20:05,000",
    },
    1000,
  );
  const report = makeReport({ pairs: [...manyPairs, fewPair] });
  const tracks = [
    makeTrack("track-many", "Many"),
    makeTrack("track-few", "Few"),
  ];
  const view = renderDialog({ report, tracks });

  const fewSection = view.getByRole("region", { name: "Few" });
  assert.equal(
    within(fewSection).getAllByText(messages.overlaps.pairsSection).length,
    1,
    "the later track must still render its pair section",
  );
  assert.equal(
    fewSection.querySelectorAll("[data-overlap-pair]").length,
    1,
    "the later track must keep its own pair row",
  );
  assert.ok(
    (fewSection.textContent ?? "").includes(formatOverlapSeconds(1000)),
  );
  assert.ok(
    !(fewSection.textContent ?? "").includes("…and"),
    "a track under the cap has nothing hidden",
  );

  const manySection = view.getByRole("region", { name: "Many" });
  assert.ok(
    (manySection.textContent ?? "").includes("…and 2 more"),
    "the hidden count belongs to the huge track's own section",
  );
});

test("report dialog sections sit one heading level under the track heading", () => {
  const view = renderDialog({ report: sampleReport });

  view.getByRole("heading", { level: 3, name: /English/ });
  view.getByRole("heading", {
    level: 4,
    name: messages.overlaps.pairsSection,
  });
  view.getByRole("heading", {
    level: 4,
    name: messages.overlaps.invalidSection,
  });
});

test("report dialog renders nothing for a clean report", () => {
  const view = renderDialog({ report: makeReport({}) });

  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(view.baseElement.querySelector("[data-overlap-pair]"), null);
});
