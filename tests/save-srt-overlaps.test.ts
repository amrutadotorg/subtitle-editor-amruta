import test from "node:test";
import assert from "node:assert/strict";
// Must precede component imports so Radix portals mount synchronously.
import { cleanup, fireEvent, renderWithIntl, within } from "./helpers/render";
import { createElement } from "react";
import SaveSrt from "../components/app-header/save-srt";
import {
  SubtitleProvider,
  useSubtitleActionsContext,
} from "../context/subtitle";
import {
  buildCsvContent,
  buildPlainTextContent,
  buildSrtContent,
  buildVttContent,
} from "../lib/format";
import type { Subtitle, SubtitleTrack } from "../types/subtitle";
import messages from "../messages/en.json";

const makeSubtitle = (overrides: Partial<Subtitle>): Subtitle => ({
  uuid: "subtitle",
  id: 1,
  startTime: "00:00:00,000",
  endTime: "00:00:02,000",
  text: "Text",
  ...overrides,
});

// Cue 2 starts before cue 1 ends → one overlapping pair.
const overlappingTrack: SubtitleTrack = {
  id: "track-overlapping",
  name: "Overlapping",
  subtitles: [
    makeSubtitle({
      uuid: "overlap-a",
      id: 1,
      startTime: "00:00:00,000",
      endTime: "00:00:04,000",
      text: "First",
    }),
    makeSubtitle({
      uuid: "overlap-b",
      id: 2,
      startTime: "00:00:03,000",
      endTime: "00:00:05,000",
      text: "Second",
    }),
  ],
};

// Cues touch exactly (end == start) → no overlaps.
const cleanTrack: SubtitleTrack = {
  id: "track-clean",
  name: "Clean",
  subtitles: [
    makeSubtitle({
      uuid: "clean-a",
      id: 1,
      startTime: "00:00:00,000",
      endTime: "00:00:02,000",
      text: "First",
    }),
    makeSubtitle({
      uuid: "clean-b",
      id: 2,
      startTime: "00:00:02,000",
      endTime: "00:00:04,000",
      text: "Second",
    }),
  ],
};

// A second colliding track, so per-track confirmations can be told apart.
const secondOverlappingTrack: SubtitleTrack = {
  id: "track-second",
  name: "Second track",
  subtitles: [
    makeSubtitle({
      uuid: "second-a",
      id: 10,
      startTime: "00:00:10,000",
      endTime: "00:00:14,000",
      text: "Ten",
    }),
    makeSubtitle({
      uuid: "second-b",
      id: 11,
      startTime: "00:00:13,000",
      endTime: "00:00:15,000",
      text: "Eleven",
    }),
  ],
};

interface DownloadedFile {
  fileName: string;
  content: string;
  mime: string;
}

/** Seeds the real provider through a click, so no effect writes state. */
const SeedTracks = ({ tracks }: { tracks: SubtitleTrack[] }) => {
  const { addTrack } = useSubtitleActionsContext();
  return createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        for (const track of tracks) {
          addTrack(track.name, track.subtitles);
        }
      },
    },
    "seed-tracks",
  );
};

const renderSaveDialog = (
  tracks: SubtitleTrack[],
  downloads: DownloadedFile[] = [],
) => {
  const view = renderWithIntl(
    createElement(
      SubtitleProvider,
      null,
      createElement(SeedTracks, { tracks }),
      createElement(SaveSrt, {
        onDownload: (file: DownloadedFile) => {
          downloads.push(file);
        },
      }),
    ),
  );
  fireEvent.click(view.getByRole("button", { name: "seed-tracks" }));
  fireEvent.click(view.getByRole("button", { name: messages.buttons.saveSrt }));
  return view;
};

const trackRow = (
  view: ReturnType<typeof renderSaveDialog>,
  name: string,
): HTMLElement => {
  const row = view.getByText(name).closest<HTMLElement>("[data-save-track]");
  assert.ok(row, `${name} track row must render`);
  return row;
};

const formatButton = (
  view: ReturnType<typeof renderSaveDialog>,
  trackName: string,
  label: string,
) => within(trackRow(view, trackName)).getByRole("button", { name: label });

const formatCueRange = (start: string, end: string) =>
  messages.overlaps.cueRange.replace("{start}", start).replace("{end}", end);

test.afterEach(() => cleanup());

test("save dialog badges only the track that has overlaps", () => {
  const view = renderSaveDialog([overlappingTrack, cleanTrack]);

  const overlappingRow = trackRow(view, "Overlapping");
  const cleanRow = trackRow(view, "Clean");

  const badges = overlappingRow.querySelectorAll("[data-overlap-badge]");
  assert.equal(badges.length, 1);
  assert.match(badges[0]?.textContent ?? "", /1/);

  assert.equal(cleanRow.querySelectorAll("[data-overlap-badge]").length, 0);
});

test("SRT for a track with overlaps opens a confirmation listing its pairs", () => {
  const downloads: DownloadedFile[] = [];
  const view = renderSaveDialog([overlappingTrack, cleanTrack], downloads);

  fireEvent.click(formatButton(view, "Overlapping", ".srt"));

  view.getByText(messages.overlaps.saveConfirmTitle);
  view.getByText(/Track Overlapping has 1 overlapping pair\./);
  view.getByText(formatCueRange("00:00:00,000", "00:00:04,000"));
  view.getByText(formatCueRange("00:00:03,000", "00:00:05,000"));
  assert.equal(downloads.length, 0, "confirming comes before any download");
});

test("VTT for a track with overlaps opens the same confirmation", () => {
  const downloads: DownloadedFile[] = [];
  const view = renderSaveDialog([overlappingTrack], downloads);

  fireEvent.click(formatButton(view, "Overlapping", ".vtt"));

  view.getByText(messages.overlaps.saveConfirmTitle);
  assert.equal(downloads.length, 0);
});

test("Back closes the confirmation without downloading and keeps the format choice", () => {
  const downloads: DownloadedFile[] = [];
  const view = renderSaveDialog([overlappingTrack], downloads);

  fireEvent.click(formatButton(view, "Overlapping", ".srt"));
  fireEvent.click(view.getByRole("button", { name: messages.overlaps.back }));

  assert.equal(view.queryByText(messages.overlaps.saveConfirmTitle), null);
  assert.equal(downloads.length, 0, "Back must not download");

  view.getByText(messages.dialog.saveTitle);
  // The save dialog is still usable: choosing VTT asks again.
  fireEvent.click(formatButton(view, "Overlapping", ".vtt"));
  view.getByText(messages.overlaps.saveConfirmTitle);
});

test("Download anyway saves the unchanged SRT and closes the save dialog", () => {
  const downloads: DownloadedFile[] = [];
  const view = renderSaveDialog([overlappingTrack], downloads);

  fireEvent.click(formatButton(view, "Overlapping", ".srt"));
  fireEvent.click(
    view.getByRole("button", { name: messages.overlaps.downloadAnyway }),
  );

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0]?.fileName, "Overlapping.srt");
  assert.equal(downloads[0]?.mime, "text/plain");
  assert.equal(
    downloads[0]?.content,
    buildSrtContent(overlappingTrack.subtitles),
    "the file must be byte-identical to the pre-warning export",
  );
  assert.equal(view.queryByText(messages.overlaps.saveConfirmTitle), null);
  assert.equal(view.queryByText(messages.dialog.saveTitle), null);
});

test("Download anyway saves the unchanged VTT for a VTT choice", () => {
  const downloads: DownloadedFile[] = [];
  const view = renderSaveDialog([overlappingTrack], downloads);

  fireEvent.click(formatButton(view, "Overlapping", ".vtt"));
  fireEvent.click(
    view.getByRole("button", { name: messages.overlaps.downloadAnyway }),
  );

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0]?.fileName, "Overlapping.vtt");
  assert.equal(downloads[0]?.mime, "text/vtt");
  assert.equal(
    downloads[0]?.content,
    buildVttContent(overlappingTrack.subtitles),
  );
});

test("TXT and CSV download a track with overlaps without confirmation", () => {
  const downloads: DownloadedFile[] = [];
  const view = renderSaveDialog([overlappingTrack], downloads);

  fireEvent.click(formatButton(view, "Overlapping", ".txt"));
  assert.equal(downloads.length, 1);
  assert.equal(
    downloads[0]?.content,
    buildPlainTextContent(overlappingTrack.subtitles),
  );
  assert.equal(view.queryByText(messages.overlaps.saveConfirmTitle), null);

  fireEvent.click(view.getByRole("button", { name: messages.buttons.saveSrt }));
  fireEvent.click(formatButton(view, "Overlapping", ".csv"));
  assert.equal(downloads.length, 2);
  assert.equal(
    downloads[1]?.content,
    buildCsvContent(overlappingTrack.subtitles),
  );
  assert.equal(view.queryByText(messages.overlaps.saveConfirmTitle), null);
});

test("a track without overlaps downloads SRT directly", () => {
  const downloads: DownloadedFile[] = [];
  const view = renderSaveDialog([cleanTrack], downloads);

  fireEvent.click(formatButton(view, "Clean", ".srt"));

  assert.equal(view.queryByText(messages.overlaps.saveConfirmTitle), null);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0]?.content, buildSrtContent(cleanTrack.subtitles));
});

test("the confirmation lists only the chosen track's pairs", () => {
  const view = renderSaveDialog([overlappingTrack, secondOverlappingTrack]);

  fireEvent.click(formatButton(view, "Second track", ".srt"));

  view.getByText(/Track Second track has 1 overlapping pair\./);
  view.getByText(formatCueRange("00:00:10,000", "00:00:14,000"));
  view.getByText(formatCueRange("00:00:13,000", "00:00:15,000"));
  assert.equal(
    view.queryByText(formatCueRange("00:00:00,000", "00:00:04,000")),
    null,
    "the other track's overlaps must not leak into the confirmation",
  );
});
