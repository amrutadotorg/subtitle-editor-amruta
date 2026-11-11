import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import VideoPlayer from "../components/video-player";
import { SubtitleProvider } from "../context/subtitle";
import { cleanup, fireEvent, renderWithIntl } from "./helpers/render";

test.afterEach(() => cleanup());

test("VideoPlayer ignores initial timeupdate at 0 when loading new media with seekTime > 0", () => {
  const progressCalls: number[] = [];
  const dummyFile = new File(["dummy"], "test.mp4", { type: "video/mp4" });

  const view = renderWithIntl(
    createElement(
      SubtitleProvider,
      null,
      createElement(VideoPlayer, {
        mediaFile: dummyFile,
        setMediaFile: () => {},
        setMediaFileName: () => {},
        onProgress: (time: number) => {
          progressCalls.push(time);
        },
        onPlayPause: () => {},
        onDuration: () => {},
        seekTime: 15.2,
        isPlaying: false,
        playbackRate: 1,
        playInBackground: false,
      }),
    ),
  );

  const video = view.container.querySelector("video");
  assert.ok(video, "Video element must be rendered");

  // Before loadedmetadata, video fires timeupdate with currentTime 0
  fireEvent.timeUpdate(video);
  assert.equal(
    progressCalls.length,
    0,
    "timeupdate before metadata/initial seek must NOT report 0 to onProgress",
  );

  // When metadata loads, video should seek to seekTime (15.2)
  fireEvent.loadedMetadata(video);
  assert.equal(
    video.currentTime,
    15.2,
    "Video currentTime should be set to seekTime",
  );

  // While seeking, timeupdate at 0 should still be ignored
  fireEvent.timeUpdate(video);
  assert.equal(progressCalls.length, 0);

  // When seek completes, onSeeked reports the restored time
  fireEvent.seeked(video);
  assert.deepEqual(
    progressCalls,
    [15.2],
    "onSeeked should report the restored time",
  );

  // Subsequent timeupdate events report normally
  Object.defineProperty(video, "currentTime", {
    value: 16.0,
    configurable: true,
  });
  fireEvent.timeUpdate(video);
  assert.deepEqual(progressCalls, [15.2, 16.0]);
});

test("VideoPlayer with seekTime === 0 reports normally once metadata loads", () => {
  const progressCalls: number[] = [];
  const dummyFile = new File(["dummy"], "test.mp4", { type: "video/mp4" });

  const view = renderWithIntl(
    createElement(
      SubtitleProvider,
      null,
      createElement(VideoPlayer, {
        mediaFile: dummyFile,
        setMediaFile: () => {},
        setMediaFileName: () => {},
        onProgress: (time: number) => {
          progressCalls.push(time);
        },
        onPlayPause: () => {},
        onDuration: () => {},
        seekTime: 0,
        isPlaying: false,
        playbackRate: 1,
        playInBackground: false,
      }),
    ),
  );

  const video = view.container.querySelector("video");
  assert.ok(video, "Video element must be rendered");

  // Before metadata loads, timeupdate should not trigger progress
  fireEvent.timeUpdate(video);
  assert.equal(progressCalls.length, 0);

  // When metadata loads with seekTime 0, ready is immediate
  fireEvent.loadedMetadata(video);

  Object.defineProperty(video, "currentTime", {
    value: 2.5,
    configurable: true,
  });
  fireEvent.timeUpdate(video);
  assert.deepEqual(progressCalls, [2.5]);
});
