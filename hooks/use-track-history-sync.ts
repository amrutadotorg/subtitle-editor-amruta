"use client";

import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { UndoHistory } from "@/hooks/use-undoable-state";
import {
  createTrackHistory,
  historiesAreEqual,
  isHistoryEmpty,
  EMPTY_HISTORY,
} from "@/lib/subtitle-history";
import type { Subtitle, SubtitleTrack } from "@/types/subtitle";

interface UseTrackHistorySyncParams {
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  activeSubtitles: Subtitle[];
  getHistorySnapshot: () => UndoHistory<Subtitle[]>;
  setHistorySnapshot: (history: UndoHistory<Subtitle[]>) => void;
  setTracks: Dispatch<SetStateAction<SubtitleTrack[]>>;
}

export function useTrackHistorySync({
  tracks,
  activeTrackId,
  activeSubtitles,
  getHistorySnapshot,
  setHistorySnapshot,
  setTracks,
}: UseTrackHistorySyncParams) {
  const previousActiveTrackId = useRef<string | null>(null);
  const trackHistoriesRef = useRef<Map<string, UndoHistory<Subtitle[]>>>(
    new Map(),
  );

  useEffect(() => {
    const snapshot = getHistorySnapshot();
    const previousId = previousActiveTrackId.current;

    if (previousId && previousId !== activeTrackId) {
      trackHistoriesRef.current.set(previousId, snapshot);
    }

    if (!activeTrackId) {
      previousActiveTrackId.current = null;
      if (!isHistoryEmpty(snapshot)) {
        setHistorySnapshot(EMPTY_HISTORY);
      }
      return;
    }

    const cachedHistory = trackHistoriesRef.current.get(activeTrackId);

    if (!cachedHistory) {
      const activeTrack = tracks.find((track) => track.id === activeTrackId);
      const seededHistory = createTrackHistory(
        activeTrackId,
        activeTrack ? activeTrack.subtitles : [],
      );
      trackHistoriesRef.current.set(activeTrackId, seededHistory);
      if (!historiesAreEqual(seededHistory, snapshot)) {
        setHistorySnapshot(seededHistory);
      }
      previousActiveTrackId.current = activeTrackId;
      return;
    }

    if (previousId === activeTrackId) {
      if (!historiesAreEqual(cachedHistory, snapshot)) {
        trackHistoriesRef.current.set(activeTrackId, snapshot);
      }
      previousActiveTrackId.current = activeTrackId;
      return;
    }

    if (!historiesAreEqual(cachedHistory, snapshot)) {
      setHistorySnapshot(cachedHistory);
    }
    previousActiveTrackId.current = activeTrackId;
  }, [activeTrackId, getHistorySnapshot, setHistorySnapshot, tracks]);

  useEffect(() => {
    if (!activeTrackId) return;
    setTracks((prevTracks) => {
      let hasChanges = false;
      const nextTracks = prevTracks.map((track) => {
        if (track.id !== activeTrackId) {
          return track;
        }
        if (track.subtitles === activeSubtitles) {
          return track;
        }
        hasChanges = true;
        return {
          ...track,
          subtitles: activeSubtitles,
        };
      });
      return hasChanges ? nextTracks : prevTracks;
    });
  }, [activeTrackId, activeSubtitles, setTracks]);

  return { trackHistoriesRef } as const;
}
