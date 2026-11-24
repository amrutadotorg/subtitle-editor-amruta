import test from "node:test";
import assert from "node:assert/strict";
import { act } from "@testing-library/react";
// Must precede component imports so Radix portals mount synchronously.
import { cleanup, fireEvent, renderWithIntl } from "./helpers/render";
import { createElement } from "react";
import SubtitleItem from "../components/subtitle/subtitle-item";
import { SubtitleProvider } from "../context/subtitle";
import type { OverlapPartner } from "../lib/overlap-report";
import type { Subtitle } from "../types/subtitle";
import messages from "../messages/en.json";

const subtitle: Subtitle = {
  uuid: "test-sub-overlap",
  id: 12,
  startTime: "00:01:00,000",
  endTime: "00:01:04,000",
  text: "Overlap me",
};

const partner: OverlapPartner = {
  cue: {
    uuid: "test-sub-overlap-partner",
    id: 13,
    start: "00:01:03,000",
    end: "00:01:05,000",
  },
  overlapMs: 1000,
};

const secondPartner: OverlapPartner = {
  cue: {
    uuid: "test-sub-overlap-partner-2",
    id: 14,
    start: "00:01:03,500",
    end: "00:01:06,000",
  },
  overlapMs: 500,
};

const renderRow = (overlapPartners: OverlapPartner[]) =>
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
        overlapPartners,
      }),
    ),
  );

test.afterEach(() => cleanup());

test("an overlapping row exposes data-overlap and a screen-reader description", () => {
  const view = renderRow([partner]);
  const row = view.container.querySelector("#subtitle-test-sub-overlap");

  assert.ok(row, "Subtitle row element must exist");
  assert.equal(row.getAttribute("data-overlap"), "true");

  const markers = [...row.querySelectorAll(".sr-only")].map(
    (marker) => marker.textContent ?? "",
  );
  const marker = markers.find((text) => text.includes("#13"));
  assert.ok(marker, "Screen-reader overlap description must be rendered");
  assert.ok(marker.includes("00:01:03,000"));
  assert.ok(marker.includes("00:01:05,000"));
  assert.ok(marker.includes("1.000 s"));
});

test("a row without overlaps has no marker and no screen-reader text", () => {
  const view = renderRow([]);
  const row = view.container.querySelector("#subtitle-test-sub-overlap");

  assert.ok(row, "Subtitle row element must exist");
  assert.equal(row.getAttribute("data-overlap"), null);
  assert.equal(row.querySelector(".sr-only"), null);
});

test("hovering anywhere on the outlined row explains the overlap", async () => {
  const view = renderRow([partner]);
  const row = view.container.querySelector("#subtitle-test-sub-overlap");
  assert.ok(row, "Subtitle row element must exist");

  await act(async () => {
    fireEvent.pointerMove(row, { pointerType: "mouse" });
    await new Promise((resolve) => setTimeout(resolve, 900));
  });

  const expected = messages.overlaps.tooltipPair
    .replace("{id}", "13")
    .replace("{start}", "00:01:03,000")
    .replace("{end}", "00:01:05,000")
    .replace("{value}", "1.000");
  view.getByText(expected);
});

test("a cue colliding with several partners describes each of them", () => {
  const view = renderRow([partner, secondPartner]);
  const row = view.container.querySelector("#subtitle-test-sub-overlap");

  assert.ok(row, "Subtitle row element must exist");
  assert.equal(row.getAttribute("data-overlap"), "true");

  const text = [...row.querySelectorAll(".sr-only")]
    .map((marker) => marker.textContent ?? "")
    .join(" ");
  assert.ok(text.includes("Overlaps cue #13"));
  assert.ok(text.includes("Overlaps cue #14"));
  assert.ok(text.includes("0.500 s"));
});
