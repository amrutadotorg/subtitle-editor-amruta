"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

interface VisibilityPlaybackOptions {
  onHide: () => void;
  onShow: () => void;
}

interface ResumablePlaybackHandle {
  resumePlayback: () => void;
  getCurrentTime?: () => number | undefined;
}

interface PlaybackVisibilityCoordinatorOptions {
  playInBackground: boolean;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  videoPlayerRef: RefObject<ResumablePlaybackHandle | null>;
  waveformRef: RefObject<ResumablePlaybackHandle | null>;
  /** Called on visibility restore to immediately sync UI with actual media time */
  onTimeSync?: (time: number) => void;
}

export const shouldIgnorePauseWhileHidden = (playInBackground: boolean) =>
  playInBackground && typeof document !== "undefined" && document.hidden;

const blurActiveElement = () => {
  if (typeof document !== "undefined") {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
};

const useVisibilityPlayback = ({
  onHide,
  onShow,
}: VisibilityPlaybackOptions) => {
  const onHideRef = useRef(onHide);
  const onShowRef = useRef(onShow);

  useEffect(() => {
    onHideRef.current = onHide;
    onShowRef.current = onShow;
  }, [onHide, onShow]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        onHideRef.current();
      } else {
        onShowRef.current();
      }
    };

    const handleWindowFocus = () => {
      if (!document.hidden) {
        onShowRef.current();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);
};

export const usePlaybackVisibilityCoordinator = ({
  playInBackground,
  isPlaying,
  setIsPlaying,
  videoPlayerRef,
  waveformRef,
  onTimeSync,
}: PlaybackVisibilityCoordinatorOptions) => {
  const handleHide = useCallback(() => {
    if (!playInBackground) {
      setIsPlaying(false);
    } else if (isPlaying) {
      blurActiveElement();
    }
  }, [isPlaying, playInBackground, setIsPlaying]);

  const handleShow = useCallback(() => {
    if (playInBackground && isPlaying) {
      blurActiveElement();
      const currentTime = videoPlayerRef.current?.getCurrentTime?.();
      if (typeof currentTime === "number" && !Number.isNaN(currentTime)) {
        onTimeSync?.(currentTime);
      }
      videoPlayerRef.current?.resumePlayback();
      waveformRef.current?.resumePlayback();
    }
  }, [isPlaying, onTimeSync, playInBackground, videoPlayerRef, waveformRef]);

  useVisibilityPlayback({
    onHide: handleHide,
    onShow: handleShow,
  });
};
