"use client";

import type { SubtitleActions } from "@/hooks/use-subtitle-actions";
import { buildOverlapReport, type OverlapReport } from "@/lib/overlap-report";
import {
  extractVttPrologue,
  parseSRT,
  parseVTT,
} from "@/lib/subtitle-operations";
import type { Subtitle, SubtitleTrack } from "@/types/subtitle";
import { useCallback } from "react";

/** Per-call options for a single import. */
export interface SubtitleFileLoadOptions {
  /** Load into this track instead of the empty-active-track / new-track branch. */
  trackId?: string;
  /** Called when the file parses to zero usable cues (nothing is written). */
  onEmpty?: () => void;
  /** Receives the report for the resulting workspace; overrides the hook default. */
  onImported?: (report: OverlapReport) => void;
}

interface UseSubtitleFileLoaderOptions {
  activeTrackId: string | null;
  activeTrackIsEmpty: boolean;
  /** Current workspace, used to build the post-import report before React re-renders. */
  tracks: SubtitleTrack[];
  newSubtitleText: string;
  newTrackName: string;
  loadSubtitlesIntoTrack: SubtitleActions["loadSubtitlesIntoTrack"];
  renameTrack: SubtitleActions["renameTrack"];
  setInitialSubtitles: SubtitleActions["setInitialSubtitles"];
  /** Default post-import callback for every load; a call-level callback wins. */
  onImported?: (report: OverlapReport) => void;
}

const buildResultingWorkspace = (
  tracks: SubtitleTrack[],
  trackId: string,
  trackName: string,
  subtitles: Subtitle[],
): SubtitleTrack[] => {
  if (!tracks.some((track) => track.id === trackId)) {
    return [...tracks, { id: trackId, name: trackName, subtitles }];
  }
  return tracks.map((track) =>
    track.id === trackId ? { ...track, name: trackName, subtitles } : track,
  );
};

export const useSubtitleFileLoader = ({
  activeTrackId,
  activeTrackIsEmpty,
  tracks,
  newSubtitleText,
  newTrackName,
  loadSubtitlesIntoTrack,
  renameTrack,
  setInitialSubtitles,
  onImported,
}: UseSubtitleFileLoaderOptions) => {
  const loadSubtitleFile = useCallback(
    async (file: File, options?: SubtitleFileLoadOptions) => {
      const text = await file.text();
      const firstLine =
        text.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
      const isVtt =
        file.name.toLowerCase().endsWith(".vtt") ||
        /^WEBVTT( |$)/.test(firstLine);
      const parsedSubtitles = isVtt ? parseVTT(text) : parseSRT(text);
      const meta = isVtt ? extractVttPrologue(text) : undefined;
      const safeTrackName = file.name.replace(/\.(srt|vtt)$/i, "") || file.name;
      const trackMeta = meta
        ? { vttHeader: meta.header, vttPrologue: meta.prologue }
        : undefined;

      if (parsedSubtitles.length === 0) {
        options?.onEmpty?.();
        return;
      }

      let resultTrackId: string | null = null;

      if (options?.trackId) {
        resultTrackId = options.trackId;
        loadSubtitlesIntoTrack(resultTrackId, parsedSubtitles, trackMeta);
        renameTrack(resultTrackId, safeTrackName);
      } else if (activeTrackId && activeTrackIsEmpty) {
        resultTrackId = activeTrackId;
        loadSubtitlesIntoTrack(activeTrackId, parsedSubtitles, trackMeta);
        renameTrack(activeTrackId, safeTrackName);
      } else {
        resultTrackId = setInitialSubtitles(
          parsedSubtitles,
          safeTrackName,
          trackMeta,
        );
      }

      const notify = options?.onImported ?? onImported;
      if (!resultTrackId || !notify) {
        return;
      }

      notify(
        buildOverlapReport(
          buildResultingWorkspace(
            tracks,
            resultTrackId,
            safeTrackName,
            parsedSubtitles,
          ),
        ),
      );
    },
    [
      activeTrackId,
      activeTrackIsEmpty,
      loadSubtitlesIntoTrack,
      renameTrack,
      setInitialSubtitles,
      tracks,
      onImported,
    ],
  );

  const handleStartFromScratch = useCallback(() => {
    setInitialSubtitles(
      [
        {
          uuid: crypto.randomUUID(),
          id: 1,
          startTime: "00:00:00,000",
          endTime: "00:00:03,000",
          text: newSubtitleText,
        },
      ],
      newTrackName,
    );
  }, [newSubtitleText, newTrackName, setInitialSubtitles]);

  return {
    loadSubtitleFile,
    handleStartFromScratch,
  };
};
