import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderHook, act } from "@testing-library/react";
import {
  shouldIgnorePauseWhileHidden,
  usePlaybackVisibilityCoordinator,
} from "../hooks/use-visibility-playback";

// DOM environment for testing visibilitychange
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
const { window } = dom;

globalThis.window = window as unknown as typeof globalThis.window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
Object.defineProperty(globalThis, "navigator", {
  value: window.navigator,
  configurable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setDocumentHidden = (hidden: boolean) => {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
};

test("shouldIgnorePauseWhileHidden checks playInBackground and document.hidden", () => {
  setDocumentHidden(true);
  assert.equal(shouldIgnorePauseWhileHidden(true), true);
  assert.equal(shouldIgnorePauseWhileHidden(false), false);

  setDocumentHidden(false);
  assert.equal(shouldIgnorePauseWhileHidden(true), false);
  assert.equal(shouldIgnorePauseWhileHidden(false), false);
});

test("usePlaybackVisibilityCoordinator pauses playback on hide when playInBackground is false", () => {
  setDocumentHidden(false);
  let isPlaying = true;
  const setIsPlaying = (val: boolean) => {
    isPlaying = val;
  };
  const videoPlayerRef = { current: { resumePlayback: () => {} } };
  const waveformRef = { current: { resumePlayback: () => {} } };

  renderHook(() =>
    usePlaybackVisibilityCoordinator({
      playInBackground: false,
      isPlaying,
      setIsPlaying,
      videoPlayerRef,
      waveformRef,
    }),
  );

  act(() => {
    setDocumentHidden(true);
    document.dispatchEvent(new window.Event("visibilitychange"));
  });

  assert.equal(isPlaying, false);
});

test("usePlaybackVisibilityCoordinator keeps playing and blurs activeElement on hide when playInBackground is true", () => {
  setDocumentHidden(false);
  let isPlaying = true;
  const setIsPlaying = (val: boolean) => {
    isPlaying = val;
  };
  const videoPlayerRef = { current: { resumePlayback: () => {} } };
  const waveformRef = { current: { resumePlayback: () => {} } };

  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  let blurred = false;
  input.addEventListener("blur", () => {
    blurred = true;
  });

  renderHook(() =>
    usePlaybackVisibilityCoordinator({
      playInBackground: true,
      isPlaying,
      setIsPlaying,
      videoPlayerRef,
      waveformRef,
    }),
  );

  act(() => {
    setDocumentHidden(true);
    document.dispatchEvent(new window.Event("visibilitychange"));
  });

  assert.equal(isPlaying, true);
  assert.equal(blurred, true);
  document.body.removeChild(input);
});

test("usePlaybackVisibilityCoordinator synchronizes time and resumes playback on show when playing in background", () => {
  setDocumentHidden(true);
  let syncedTime: number | null = null;
  let videoResumed = false;
  let waveformResumed = false;

  const videoPlayerRef = {
    current: {
      resumePlayback: () => {
        videoResumed = true;
      },
      getCurrentTime: () => 42.5,
    },
  };
  const waveformRef = {
    current: {
      resumePlayback: () => {
        waveformResumed = true;
      },
    },
  };

  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  let blurred = false;
  input.addEventListener("blur", () => {
    blurred = true;
  });

  renderHook(() =>
    usePlaybackVisibilityCoordinator({
      playInBackground: true,
      isPlaying: true,
      setIsPlaying: () => {},
      videoPlayerRef,
      waveformRef,
      onTimeSync: (time) => {
        syncedTime = time;
      },
    }),
  );

  act(() => {
    setDocumentHidden(false);
    document.dispatchEvent(new window.Event("visibilitychange"));
  });

  assert.equal(syncedTime, 42.5);
  assert.equal(videoResumed, true);
  assert.equal(waveformResumed, true);
  assert.equal(blurred, true);
  document.body.removeChild(input);
});

test("usePlaybackVisibilityCoordinator responds to window focus when visible", () => {
  setDocumentHidden(false);
  let syncedTime: number | null = null;

  const videoPlayerRef = {
    current: {
      resumePlayback: () => {},
      getCurrentTime: () => 55.0,
    },
  };
  const waveformRef = {
    current: {
      resumePlayback: () => {},
    },
  };

  renderHook(() =>
    usePlaybackVisibilityCoordinator({
      playInBackground: true,
      isPlaying: true,
      setIsPlaying: () => {},
      videoPlayerRef,
      waveformRef,
      onTimeSync: (time) => {
        syncedTime = time;
      },
    }),
  );

  act(() => {
    window.dispatchEvent(new window.Event("focus"));
  });

  assert.equal(syncedTime, 55.0);
});

test("usePlaybackVisibilityCoordinator does not sync or resume on show when isPlaying is false", () => {
  setDocumentHidden(true);
  let syncedTime: number | null = null;
  let videoResumed = false;

  const videoPlayerRef = {
    current: {
      resumePlayback: () => {
        videoResumed = true;
      },
      getCurrentTime: () => 42.5,
    },
  };
  const waveformRef = {
    current: {
      resumePlayback: () => {},
    },
  };

  renderHook(() =>
    usePlaybackVisibilityCoordinator({
      playInBackground: true,
      isPlaying: false,
      setIsPlaying: () => {},
      videoPlayerRef,
      waveformRef,
      onTimeSync: (time) => {
        syncedTime = time;
      },
    }),
  );

  act(() => {
    setDocumentHidden(false);
    document.dispatchEvent(new window.Event("visibilitychange"));
  });

  assert.equal(syncedTime, null);
  assert.equal(videoResumed, false);
});
