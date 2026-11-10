"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { SubtitleTimingEntry } from "@/context/subtitle/types";
import {
  resolveResumeUuid,
  writeLastPosition,
  type ResumeCandidate,
} from "@/lib/last-position";
import { findActiveSubtitleIndex } from "@/lib/subtitle-lookup";
import { getCuePreviewSeekTime } from "@/lib/subtitle-playback";

const WRITE_DEBOUNCE_MS = 500;
const RESTORE_SUPPRESSION_MS = 1500;

interface UseResumeCursorParams {
  /** Only record while a session is live (no pending recovery, cues present). */
  enabled: boolean;
  workspaceKey: string;
  isPlaying: boolean;
  playbackTime: number;
  /** Identity of the loaded media (file name/size or Vimeo id); null when none. */
  mediaKey: string | null;
  trackId: string | null;
  /** Timings of the ACTIVE track only (provider derives them from activeSubtitles). */
  subtitleTimings: SubtitleTimingEntry[];
  /** Candidate restored from storage; consumed once, then cleared. */
  resumeTarget: ResumeCandidate | null;
  clearResumeTarget: () => void;
  setPlaybackTime: (time: number) => void;
  pendingSeekRef: MutableRefObject<number | null>;
  requestScroll: (uuid: string, opts?: { instant?: boolean }) => void;
  editingSubtitleUuid: string | null;
  activeTrackId: string | null;
}

interface UseResumeCursorResult {
  /** Cue to highlight after a restore (null outside the restore flow). */
  resumeUuid: string | null;
  recordInteraction: (uuid: string) => void;
  clearResumeHighlight: () => void;
  flush: () => void;
}

export function useResumeCursor({
  enabled,
  workspaceKey,
  isPlaying,
  playbackTime,
  mediaKey,
  trackId,
  subtitleTimings,
  resumeTarget,
  clearResumeTarget,
  setPlaybackTime,
  pendingSeekRef,
  requestScroll,
  editingSubtitleUuid,
  activeTrackId,
}: UseResumeCursorParams): UseResumeCursorResult {
  const [resumeUuid, setResumeUuid] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const suppressedRef = useRef(false);
  // Passive playback-time changes only become a position once the user has
  // actually played or interacted. Without this, loading a media file (which
  // reports time 0) or the post-import jump to cue #1 would overwrite the
  // remembered cue.
  const engagedRef = useRef(false);
  const suppressionTimeoutRef = useRef<number | null>(null);
  const latestCandidateRef = useRef<ResumeCandidate | null>(null);
  const writeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceKeyRef = useRef(workspaceKey);

  useEffect(() => {
    workspaceKeyRef.current = workspaceKey;
  }, [workspaceKey]);

  // Swapping the media (or its absence) invalidates the engagement state: the
  // player will report time 0 and must not be mistaken for "paused at cue #1".
  useEffect(() => {
    engagedRef.current = false;
  }, [mediaKey]);

  useEffect(() => {
    if (isPlaying) {
      engagedRef.current = true;
    }
  }, [isPlaying]);

  const flush = useCallback(() => {
    if (writeTimeoutRef.current !== null) {
      clearTimeout(writeTimeoutRef.current);
      writeTimeoutRef.current = null;
    }

    const candidate = latestCandidateRef.current;
    if (!candidate) return;

    latestCandidateRef.current = null;
    writeLastPosition(workspaceKeyRef.current, candidate);
  }, []);

  const queue = useCallback((candidate: ResumeCandidate) => {
    latestCandidateRef.current = candidate;
    if (writeTimeoutRef.current !== null) {
      clearTimeout(writeTimeoutRef.current);
    }
    writeTimeoutRef.current = setTimeout(() => {
      writeTimeoutRef.current = null;
      const latest = latestCandidateRef.current;
      if (!latest) return;
      latestCandidateRef.current = null;
      writeLastPosition(workspaceKeyRef.current, latest);
    }, WRITE_DEBOUNCE_MS);
  }, []);

  const recordInteraction = useCallback(
    (uuid: string) => {
      if (!enabled) return;

      const index = subtitleTimings.findIndex((entry) => entry.uuid === uuid);
      if (index < 0) return;

      engagedRef.current = true;
      const entry = subtitleTimings[index];
      queue({
        uuid: entry.uuid,
        trackId,
        cueIndex: index,
        cueStart: entry.start,
        time: getCuePreviewSeekTime(entry.start, entry.end),
        updatedAt: Date.now(),
      });
    },
    [enabled, subtitleTimings, trackId, queue],
  );

  // Pause / seek: remember the cue that is active at the moment of the stop.
  useEffect(() => {
    // A pending restore is consumed by the effect below; never record cue #1
    // from the transient state of this same commit.
    if (!enabled || resumeTarget || suppressedRef.current || suppressed) return;
    if (isPlaying) return;
    // Media load / post-import jump: not a deliberate pause.
    if (!engagedRef.current) return;

    const index = findActiveSubtitleIndex(subtitleTimings, playbackTime, -1);
    if (index < 0) return;

    const entry = subtitleTimings[index];
    queue({
      uuid: entry.uuid,
      trackId,
      cueIndex: index,
      cueStart: entry.start,
      time: playbackTime,
      updatedAt: Date.now(),
    });
  }, [
    enabled,
    resumeTarget,
    suppressed,
    isPlaying,
    playbackTime,
    subtitleTimings,
    trackId,
    queue,
  ]);

  // Restore: scroll + highlight the remembered cue, seek without autoplay.
  useEffect(() => {
    if (!resumeTarget) return;

    const uuid = resolveResumeUuid(resumeTarget, subtitleTimings);

    suppressedRef.current = true;
    engagedRef.current = false;
    setSuppressed(true);
    if (suppressionTimeoutRef.current !== null) {
      window.clearTimeout(suppressionTimeoutRef.current);
    }
    suppressionTimeoutRef.current = window.setTimeout(() => {
      suppressionTimeoutRef.current = null;
      suppressedRef.current = false;
      setSuppressed(false);
    }, RESTORE_SUPPRESSION_MS);

    if (resumeTarget.time > 0) {
      setPlaybackTime(resumeTarget.time);
      pendingSeekRef.current = resumeTarget.time;
    }

    if (uuid) {
      setResumeUuid(uuid);
      requestScroll(uuid, { instant: true });
    }

    clearResumeTarget();
  }, [
    resumeTarget,
    subtitleTimings,
    setPlaybackTime,
    pendingSeekRef,
    requestScroll,
    clearResumeTarget,
  ]);

  // Focus / keyboard navigation / add / split all land here (editing uuid).
  useEffect(() => {
    if (!editingSubtitleUuid) return;
    recordInteraction(editingSubtitleUuid);
    setResumeUuid(null);
  }, [editingSubtitleUuid, recordInteraction]);

  // Switching tracks drops the highlight.
  useEffect(() => {
    setResumeUuid(null);
  }, [activeTrackId]);

  const clearResumeHighlight = useCallback(() => {
    setResumeUuid(null);
  }, []);

  useEffect(() => {
    return () => {
      if (suppressionTimeoutRef.current !== null) {
        window.clearTimeout(suppressionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePageHide = () => flush();
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      flush();
    };
  }, [flush]);

  return { resumeUuid, recordInteraction, clearResumeHighlight, flush };
}
