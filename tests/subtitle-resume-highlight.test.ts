import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import SubtitleItem from "../components/subtitle/subtitle-item";
import { SubtitleProvider } from "../context/subtitle";
import type { Subtitle } from "../types/subtitle";
import { cleanup, renderWithIntl } from "./helpers/render";
import messages from "../messages/en.json";

const subtitle: Subtitle = {
  uuid: "test-sub-resume",
  id: 12,
  startTime: "00:01:00,000",
  endTime: "00:01:04,000",
  text: "Resume me",
};

const renderRow = (isResumeTarget: boolean) =>
  renderWithIntl(
    createElement(
      SubtitleProvider,
      null,
      createElement(SubtitleItem, {
        subtitle,
        nextSubtitle: null,
        previousSubtitle: null,
        isLastItem: false,
        currentTime: 0,
        editingSubtitleUuid: null,
        onScrollToRegion: () => {},
        isPlaying: false,
        resumePlayback: () => {},
        setIsPlaying: () => {},
        setPlaybackTime: () => {},
        setEditingSubtitleUuid: () => {},
        onPrepareSubtitleInteraction: () => {},
        isResumeTarget,
      }),
    ),
  );

test.afterEach(() => cleanup());

test("resume target row exposes data-resume and a screen-reader description", () => {
  const view = renderRow(true);
  const row = view.container.querySelector("#subtitle-test-sub-resume");

  assert.ok(row, "Subtitle row element must exist");
  assert.equal(row.getAttribute("data-resume"), "true");

  const marker = row.querySelector(".sr-only");
  assert.ok(marker, "Screen-reader marker must be rendered");
  assert.equal(marker.textContent, messages.localSession.resumeMarker);

  // The marker sits inside the cue-number column, not directly in the grid.
  assert.equal(marker.parentElement?.className.includes("font-mono"), true);
});

test("a regular row has no resume marker", () => {
  const view = renderRow(false);
  const row = view.container.querySelector("#subtitle-test-sub-resume");

  assert.ok(row, "Subtitle row element must exist");
  assert.equal(row.getAttribute("data-resume"), null);
  assert.equal(row.querySelector(".sr-only"), null);
});
