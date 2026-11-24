import test from "node:test";
import assert from "node:assert/strict";
// Must precede component imports so Radix portals mount synchronously.
import { cleanup, fireEvent, renderWithIntl } from "./helpers/render";
import { act } from "@testing-library/react";
import { createElement, useState } from "react";
import OverlapReportDialog from "../components/overlap-report/overlap-report-dialog";
import {
  SubtitleProvider,
  useLocalSession,
  useSubtitleActionsContext,
  useSubtitleState,
} from "../context/subtitle";
import { useSubtitleFileLoader } from "../hooks/use-subtitle-file-loader";
import {
  createLocalSessionSnapshot,
  writeLocalSessionSnapshot,
} from "../lib/local-session";
import type { OverlapReport } from "../lib/overlap-report";
import type { Subtitle } from "../types/subtitle";

const overlappingSrt = [
  "1",
  "00:00:00,000 --> 00:00:02,000",
  "First",
  "",
  "2",
  "00:00:01,000 --> 00:00:03,000",
  "Second",
  "",
].join("\n");

const cleanSrt = [
  "1",
  "00:00:00,000 --> 00:00:02,000",
  "First",
  "",
  "2",
  "00:00:02,000 --> 00:00:04,000",
  "Second",
  "",
].join("\n");

const overlapFile = new File([overlappingSrt], "overlap.srt", {
  type: "application/x-subrip",
});
const cleanFile = new File([cleanSrt], "clean.srt", {
  type: "application/x-subrip",
});

const existingOverlappingCues: Subtitle[] = [
  {
    uuid: "existing-10",
    id: 10,
    startTime: "00:00:10,000",
    endTime: "00:00:12,000",
    text: "Existing first",
  },
  {
    uuid: "existing-11",
    id: 11,
    startTime: "00:00:11,000",
    endTime: "00:00:13,000",
    text: "Existing second",
  },
];

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

function ImportHarness({ file }: { file: File }) {
  const { tracks, activeTrackId } = useSubtitleState();
  const actions = useSubtitleActionsContext();
  const { restoreLocalSession } = useLocalSession();
  const [report, setReport] = useState<OverlapReport | null>(null);

  const activeTrack = tracks.find((track) => track.id === activeTrackId);
  const activeTrackIsEmpty =
    Boolean(activeTrackId) && (activeTrack?.subtitles.length ?? 0) === 0;

  const { loadSubtitleFile } = useSubtitleFileLoader({
    activeTrackId,
    activeTrackIsEmpty,
    tracks,
    newSubtitleText: "New subtitle",
    newTrackName: "Track 1",
    loadSubtitlesIntoTrack: actions.loadSubtitlesIntoTrack,
    renameTrack: actions.renameTrack,
    setInitialSubtitles: actions.setInitialSubtitles,
    onImported: setReport,
  });

  const summary = tracks
    .map((track) => `${track.name}:${track.subtitles.length}`)
    .join("|");

  return createElement(
    "div",
    null,
    createElement(
      "button",
      {
        type: "button",
        onClick: () => {
          actions.setInitialSubtitles(
            existingOverlappingCues.map((cue) => ({ ...cue })),
            "Existing",
          );
        },
      },
      "seed",
    ),
    createElement(
      "button",
      {
        type: "button",
        onClick: () => {
          void loadSubtitleFile(file, {
            trackId: activeTrackId ?? undefined,
          });
        },
      },
      "load-into-active",
    ),
    createElement(
      "button",
      {
        type: "button",
        onClick: () => {
          void loadSubtitleFile(file);
        },
      },
      "load-as-new",
    ),
    createElement(
      "button",
      { type: "button", onClick: () => restoreLocalSession() },
      "restore",
    ),
    createElement("span", { "data-testid": "track-summary" }, summary),
    createElement(OverlapReportDialog, {
      open: report !== null,
      onOpenChange: (open) => {
        if (!open) setReport(null);
      },
      report,
      tracks,
      onNavigate: () => {},
    }),
  );
}

const renderHarness = (file: File) =>
  renderWithIntl(
    createElement(
      SubtitleProvider,
      null,
      createElement(ImportHarness, { file }),
    ),
  );

const click = async (view: ReturnType<typeof renderHarness>, name: string) => {
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name }));
  });
  await flush();
};

test.beforeEach(() => {
  window.localStorage.clear();
});

test.afterEach(() => {
  cleanup();
});

test("loading an overlapping file into a track opens the report dialog", async () => {
  const view = renderHarness(overlapFile);

  await click(view, "seed");
  await click(view, "load-into-active");

  view.getByRole("dialog");
  view.getByRole("region", { name: "overlap" });
  assert.equal(view.getByTestId("track-summary").textContent, "overlap:2");
});

test("loading a clean file does not open the report dialog", async () => {
  const view = renderHarness(cleanFile);

  await click(view, "seed");
  await click(view, "load-into-active");

  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(view.getByTestId("track-summary").textContent, "clean:2");
});

test("the import report covers the new track and every existing track", async () => {
  const view = renderHarness(overlapFile);

  await click(view, "seed");
  await click(view, "load-as-new");

  view.getByRole("dialog");
  view.getByRole("region", { name: "Existing" });
  view.getByRole("region", { name: "overlap" });
  assert.equal(
    view.getByTestId("track-summary").textContent,
    "Existing:2|overlap:2",
  );
});

test("restoring a local session with overlaps never opens the report", async () => {
  writeLocalSessionSnapshot(
    createLocalSessionSnapshot({
      tracks: [
        {
          id: "track-saved",
          name: "Saved",
          subtitles: existingOverlappingCues.map((cue) => ({
            ...cue,
            trackId: "track-saved",
          })),
        },
      ],
      activeTrackId: "track-saved",
      preferences: {
        showTrackLabels: true,
        showSubtitleDuration: true,
        addSpaceOnMerge: true,
        clampOverlaps: false,
        playInBackground: true,
      },
      now: () => 1234,
      appVersion: "test",
    }),
  );

  const view = renderHarness(cleanFile);

  await click(view, "restore");

  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(view.getByTestId("track-summary").textContent, "Saved:2");
});
