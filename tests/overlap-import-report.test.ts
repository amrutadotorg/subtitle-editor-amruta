import test from "node:test";
import assert from "node:assert/strict";
import { act } from "@testing-library/react";
// Must precede component imports so Radix portals mount synchronously.
import { cleanup, fireEvent, renderWithIntl } from "./helpers/render";
import OverlapReportDialog from "../components/overlap-report/overlap-report-dialog";
import SubtitleList from "../components/subtitle/subtitle-list";
import {
  SubtitleProvider,
  useLocalSession,
  useSubtitleActionsContext,
  useSubtitleState,
} from "../context/subtitle";
import { useDroppablePanel } from "../hooks/use-droppable-panel";
import { useSharedSubtitleUrlLoader } from "../hooks/use-shared-subtitle-url-loader";
import { useSubtitleFileLoader } from "../hooks/use-subtitle-file-loader";
import { isSubtitleFile } from "../lib/file-utils";
import {
  createLocalSessionSnapshot,
  writeLocalSessionSnapshot,
} from "../lib/local-session";
import type { OverlapReport } from "../lib/overlap-report";
import type { Subtitle } from "../types/subtitle";
import { createElement, useCallback, useRef, useState } from "react";

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

const emptySrt = "this file has no cues";
const emptyFile = new File([emptySrt], "empty.srt", {
  type: "application/x-subrip",
});

const overlappingVtt = [
  "WEBVTT",
  "",
  "00:00:00.000 --> 00:00:02.000",
  "First",
  "",
  "00:00:01.000 --> 00:00:03.000",
  "Second",
  "",
].join("\n");

const cleanVtt = [
  "WEBVTT",
  "",
  "00:00:00.000 --> 00:00:02.000",
  "First",
  "",
  "00:00:02.000 --> 00:00:04.000",
  "Second",
  "",
].join("\n");

/** Wires the production import mechanism: one loader, one report callback. */
function useImportHarness() {
  const { tracks, activeTrackId } = useSubtitleState();
  const actions = useSubtitleActionsContext();
  const [report, setReport] = useState<OverlapReport | null>(null);
  const [emptyCount, setEmptyCount] = useState(0);

  const activeTrack = tracks.find((track) => track.id === activeTrackId);
  const activeTrackIsEmpty =
    Boolean(activeTrackId) && (activeTrack?.subtitles.length ?? 0) === 0;

  const handleEmpty = useCallback(() => {
    setEmptyCount((count) => count + 1);
  }, []);

  // Mirrors the editor: the callback carries the imported track, and only that
  // track's own problems open the dialog (ticket #27: a clean file never opens
  // it, even when another track in the workspace is dirty).
  const handleImported = useCallback(
    (nextReport: OverlapReport, trackId: string) => {
      const counts = nextReport.countsByTrack[trackId];
      if (!counts || (counts.overlaps === 0 && counts.invalid === 0)) return;
      setReport(nextReport);
    },
    [],
  );

  const { loadSubtitleFile } = useSubtitleFileLoader({
    activeTrackId,
    activeTrackIsEmpty,
    tracks,
    newSubtitleText: "New subtitle",
    newTrackName: "Track 1",
    loadSubtitlesIntoTrack: actions.loadSubtitlesIntoTrack,
    renameTrack: actions.renameTrack,
    setInitialSubtitles: actions.setInitialSubtitles,
    onImported: handleImported,
    onEmpty: handleEmpty,
  });

  return {
    tracks,
    activeTrackId,
    actions,
    report,
    setReport,
    emptyCount,
    loadSubtitleFile,
  };
}

const trackSummary = (tracks: ReturnType<typeof useImportHarness>["tracks"]) =>
  tracks.map((track) => `${track.name}:${track.subtitles.length}`).join("|");

const reportDialog = (
  report: OverlapReport | null,
  setReport: (report: OverlapReport | null) => void,
  tracks: ReturnType<typeof useImportHarness>["tracks"],
) =>
  createElement(OverlapReportDialog, {
    open: report !== null,
    onOpenChange: (open: boolean) => {
      if (!open) setReport(null);
    },
    report,
    tracks,
    onNavigate: () => {},
  });

function ImportHarness({ file }: { file: File }) {
  const {
    tracks,
    activeTrackId,
    actions,
    report,
    setReport,
    emptyCount,
    loadSubtitleFile,
  } = useImportHarness();
  const { restoreLocalSession } = useLocalSession();

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
      {
        type: "button",
        onClick: () => {
          void loadSubtitleFile(file);
        },
      },
      "load-empty",
    ),
    createElement(
      "button",
      { type: "button", onClick: () => restoreLocalSession() },
      "restore",
    ),
    createElement(
      "span",
      { "data-testid": "track-summary" },
      trackSummary(tracks),
    ),
    createElement("span", { "data-testid": "empty-count" }, String(emptyCount)),
    reportDialog(report, setReport, tracks),
  );
}

function DropHarness() {
  const { tracks, report, setReport, loadSubtitleFile } = useImportHarness();
  const { panelProps } = useDroppablePanel<HTMLDivElement>({
    acceptFile: isSubtitleFile,
    onDropFile: loadSubtitleFile,
  });

  return createElement(
    "div",
    { "data-testid": "drop-panel", ...panelProps },
    createElement(
      "span",
      { "data-testid": "track-summary" },
      trackSummary(tracks),
    ),
    reportDialog(report, setReport, tracks),
  );
}

function PickerHarness() {
  const { tracks, actions, report, setReport, loadSubtitleFile } =
    useImportHarness();

  return createElement(
    "div",
    null,
    createElement(
      "button",
      {
        type: "button",
        onClick: () => {
          actions.setInitialSubtitles([], "Empty track");
        },
      },
      "seed-empty-track",
    ),
    createElement(SubtitleList, {
      isPlaying: false,
      onScrollToRegion: () => {},
      resumePlayback: () => {},
      setIsPlaying: () => {},
      setPlaybackTime: () => {},
      editingSubtitleUuid: null,
      setEditingSubtitleUuid: () => {},
      onTimeJump: () => {},
      jumpDuration: 5,
      resumeUuid: null,
      onLoadSubtitleFile: loadSubtitleFile,
    }),
    createElement(
      "span",
      { "data-testid": "track-summary" },
      trackSummary(tracks),
    ),
    reportDialog(report, setReport, tracks),
  );
}

function UrlHarness() {
  const { tracks, report, setReport, loadSubtitleFile } = useImportHarness();
  const shouldJumpToFirstRef = useRef(false);
  useSharedSubtitleUrlLoader({ loadSubtitleFile, shouldJumpToFirstRef });

  return createElement(
    "div",
    null,
    createElement(
      "span",
      { "data-testid": "track-summary" },
      trackSummary(tracks),
    ),
    reportDialog(report, setReport, tracks),
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

const renderDropHarness = () =>
  renderWithIntl(
    createElement(SubtitleProvider, null, createElement(DropHarness)),
  );

const renderPickerHarness = () =>
  renderWithIntl(
    createElement(SubtitleProvider, null, createElement(PickerHarness)),
  );

const renderUrlHarness = () =>
  renderWithIntl(
    createElement(SubtitleProvider, null, createElement(UrlHarness)),
  );

const dropFile = async (
  view: ReturnType<typeof renderDropHarness>,
  file: File,
) => {
  await act(async () => {
    fireEvent.drop(view.getByTestId("drop-panel"), {
      dataTransfer: { types: ["Files"], files: [file] },
    });
  });
  await flush();
};

const chooseFile = async (input: HTMLInputElement, file: File) => {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
  await act(async () => {
    fireEvent.change(input);
  });
  await flush();
};

const originalFetch = globalThis.fetch;

const mockFetch = (body: string, ok = true) => {
  globalThis.fetch = (async () => ({
    ok,
    text: async () => body,
  })) as unknown as typeof fetch;
};

const click = async (view: ReturnType<typeof renderHarness>, name: string) => {
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name }));
  });
  await flush();
};

test.beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: window.localStorage,
  });
});

test.afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.replaceState({}, "", "/");
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

test("a clean imported file never opens the report for a dirty other track", async () => {
  const view = renderHarness(cleanFile);

  await click(view, "seed");
  await click(view, "load-as-new");

  assert.equal(
    view.queryByRole("dialog"),
    null,
    "only the imported track's own problems may open the dialog",
  );
  assert.equal(
    view.getByTestId("track-summary").textContent,
    "Existing:2|clean:2",
  );
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

test("dropping an overlapping file opens the report dialog", async () => {
  const view = renderDropHarness();

  await dropFile(view, overlapFile);

  view.getByRole("dialog");
  view.getByRole("region", { name: "overlap" });
  assert.equal(view.getByTestId("track-summary").textContent, "overlap:2");
});

test("dropping a clean file does not open the report dialog", async () => {
  const view = renderDropHarness();

  await dropFile(view, cleanFile);

  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(view.getByTestId("track-summary").textContent, "clean:2");
});

test("choosing an overlapping file in the empty-track picker opens the report dialog", async () => {
  const view = renderPickerHarness();

  await click(view, "seed-empty-track");
  const input =
    view.container.querySelector<HTMLInputElement>('input[type="file"]');
  assert.ok(input, "The empty track picker must render a file input");

  await chooseFile(input, overlapFile);

  view.getByRole("dialog");
  view.getByRole("region", { name: "overlap" });
  assert.equal(view.getByTestId("track-summary").textContent, "overlap:2");
});

test("a URL import with overlaps opens the report dialog", async () => {
  window.history.replaceState({}, "", "/?import=shared.vtt");
  mockFetch(overlappingVtt);

  const view = renderUrlHarness();
  await flush();
  await flush();

  view.getByRole("dialog");
  view.getByRole("region", { name: "shared" });
  assert.equal(view.getByTestId("track-summary").textContent, "shared:2");
});

test("a URL import with a clean file does not open the report dialog", async () => {
  window.history.replaceState({}, "", "/?caption=clean.en.vtt");
  mockFetch(cleanVtt);

  const view = renderUrlHarness();
  await flush();
  await flush();

  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(view.getByTestId("track-summary").textContent, "clean.en:2");
});

test("a failed URL fetch is never treated as an overlap report", async () => {
  window.history.replaceState({}, "", "/?import=missing.vtt");
  mockFetch("", false);

  const view = renderUrlHarness();
  await flush();
  await flush();

  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(view.getByTestId("track-summary").textContent, "");
});

test("a file with no valid cues reports onEmpty and never opens the report", async () => {
  const view = renderHarness(emptyFile);

  await click(view, "load-empty");

  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(view.getByTestId("empty-count").textContent, "1");
  assert.equal(view.getByTestId("track-summary").textContent, "");
});
