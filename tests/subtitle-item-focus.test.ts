import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import SubtitleItem from "../components/subtitle/subtitle-item";
import { SubtitleProvider } from "../context/subtitle";
import type { Subtitle } from "../types/subtitle";
import { cleanup, fireEvent, renderWithIntl } from "./helpers/render";

const subtitle: Subtitle = {
  uuid: "test-sub-630",
  id: 630,
  startTime: "00:05:00,000",
  endTime: "00:05:04,000",
  text: "Subtitle 630",
};

test.afterEach(() => cleanup());

test("SubtitleItem row does not have tabIndex and does not seek on focus", () => {
  let seeks: number[] = [];
  let scrolledToRegion: string | null = null;

  const view = renderWithIntl(
    createElement(
      SubtitleProvider,
      null,
      createElement(SubtitleItem, {
        subtitle,
        nextSubtitle: null,
        previousSubtitle: null,
        isLastItem: false,
        currentTime: 310, // Currently at 05:10 (ahead of subtitle 630)
        editingSubtitleUuid: null,
        onScrollToRegion: (uuid: string) => {
          scrolledToRegion = uuid;
        },
        isPlaying: false,
        resumePlayback: () => {},
        setIsPlaying: () => {},
        setPlaybackTime: (time: number) => {
          seeks.push(time);
        },
        setEditingSubtitleUuid: () => {},
        onPrepareSubtitleInteraction: () => {},
      }),
    ),
  );

  const row = view.container.querySelector("#subtitle-test-sub-630");
  assert.ok(row, "Subtitle row element must exist");

  // Row should NOT have tabIndex=-1 so it doesn't trap focus or scroll back on window focus
  assert.equal(row.getAttribute("tabIndex"), null);

  // Focus event (such as window focus restore) must NOT trigger a seek
  fireEvent.focus(row);
  assert.equal(seeks.length, 0, "Focusing the row must not seek");

  // User click on the row MUST seek and scroll to region
  fireEvent.click(row);
  assert.equal(seeks.length, 1, "Clicking the row must seek");
  assert.equal(seeks[0], 300.000001); // 05:00.000001 cue preview seek time
  assert.equal(scrolledToRegion, "test-sub-630");
});
