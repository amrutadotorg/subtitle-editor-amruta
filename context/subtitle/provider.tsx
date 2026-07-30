"use client";

import { useSubtitleActions } from "@/hooks/use-subtitle-actions";
import { useUndoableState } from "@/hooks/use-undoable-state";
import { useTrackHistorySync } from "@/hooks/use-track-history-sync";
import { useLocalSessionOrchestration } from "@/hooks/use-local-session-orchestration";
import { subtitlesAreEqual } from "@/lib/subtitle-history";
import {
  loadSettingsFromStorage,
  type LocalSessionPreferences,
} from "@/lib/local-session";
import { timeToSeconds } from "@/lib/utils";
import type { SubtitleTrack } from "@/types/subtitle";
import React, { useCallback, useMemo, useState } from "react";
import type { SubtitleProviderProps, LocalSessionValue } from "./types";
import { SubtitleStateContext } from "./state";
import { SubtitleActionsContext } from "./actions";
import { SubtitleHistoryContext } from "./history";
import { SubtitleDataContext } from "./data";
import { SubtitleTimingContext } from "./timing";
import { LocalSessionContext } from "./local-session";

export function SubtitleProvider({ children }: SubtitleProviderProps) {
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [showTrackLabels, setShowTrackLabels] = useState<boolean>(
    () => loadSettingsFromStorage()?.showTrackLabels ?? false,
  );
  const [showSubtitleDuration, setShowSubtitleDuration] = useState<boolean>(
    () => loadSettingsFromStorage()?.showSubtitleDuration ?? false,
  );
  const [addSpaceOnMerge, setAddSpaceOnMerge] = useState<boolean>(
    () => loadSettingsFromStorage()?.addSpaceOnMerge ?? false,
  );
  const [clampOverlaps, setClampOverlaps] = useState<boolean>(
    () => loadSettingsFromStorage()?.clampOverlaps ?? true,
  );
  const [playInBackground, setPlayInBackground] = useState<boolean>(
    () => loadSettingsFromStorage()?.playInBackground ?? false,
  );
  const [rulesMaxLineLength, setRulesMaxLineLength] = useState<number>(
    () => loadSettingsFromStorage()?.rulesMaxLineLength ?? 42,
  );
  const [rulesMaxCps, setRulesMaxCps] = useState<number>(
    () => loadSettingsFromStorage()?.rulesMaxCps ?? 25,
  );
  const [rulesMinDurationMs, setRulesMinDurationMs] = useState<number>(
    () => loadSettingsFromStorage()?.rulesMinDurationMs ?? 1000,
  );
  const [rulesMaxDurationMs, setRulesMaxDurationMs] = useState<number>(
    () => loadSettingsFromStorage()?.rulesMaxDurationMs ?? 8000,
  );

  const {
    present: activeSubtitles,
    setState: setSubtitlesWithHistory,
    undo: undoSubtitles,
    redo: redoSubtitles,
    canUndo: canUndoSubtitles,
    canRedo: canRedoSubtitles,
    getSnapshot: getHistorySnapshot,
    setSnapshot: setHistorySnapshot,
  } = useUndoableState<SubtitleTrack["subtitles"]>([], {
    isEqual: subtitlesAreEqual,
  });

  const preferences = useMemo<LocalSessionPreferences>(
    () => ({
      showTrackLabels,
      showSubtitleDuration,
      addSpaceOnMerge,
      clampOverlaps,
      playInBackground,
      rulesMaxLineLength,
      rulesMaxCps,
      rulesMinDurationMs,
      rulesMaxDurationMs,
    }),
    [
      showTrackLabels,
      showSubtitleDuration,
      addSpaceOnMerge,
      clampOverlaps,
      playInBackground,
      rulesMaxLineLength,
      rulesMaxCps,
      rulesMinDurationMs,
      rulesMaxDurationMs,
    ],
  );

  const restoreSettings = useCallback((prefs: LocalSessionPreferences) => {
    setShowTrackLabels(prefs.showTrackLabels);
    setShowSubtitleDuration(prefs.showSubtitleDuration);
    setAddSpaceOnMerge(prefs.addSpaceOnMerge);
    setClampOverlaps(prefs.clampOverlaps);
    setPlayInBackground(prefs.playInBackground);
    setRulesMaxLineLength(prefs.rulesMaxLineLength ?? 42);
    setRulesMaxCps(prefs.rulesMaxCps ?? 25);
    setRulesMinDurationMs(prefs.rulesMinDurationMs ?? 1000);
    setRulesMaxDurationMs(prefs.rulesMaxDurationMs ?? 8000);
  }, []);

  const { trackHistoriesRef } = useTrackHistorySync({
    tracks,
    activeTrackId,
    activeSubtitles,
    getHistorySnapshot,
    setHistorySnapshot,
    setTracks,
  });

  const {
    pendingLocalSession,
    hasLocalSession,
    vimeoVideoId,
    setVimeoVideoId,
    restoreLocalSession,
    discardLocalSession,
    clearLocalSession,
    downloadLocalSessionBackup,
    skipAutoRestoreRef,
  } = useLocalSessionOrchestration({
    tracks,
    activeTrackId,
    preferences,
    restoreSettings,
    setTracks,
    setActiveTrackId,
    trackHistoriesRef,
    setHistorySnapshot,
  });

  const subtitleActions = useSubtitleActions({
    tracks,
    activeTrackId,
    setTracks,
    setActiveTrackId,
    trackHistoriesRef,
    getHistorySnapshot,
    setHistorySnapshot,
    activeSubtitles,
    setSubtitlesWithHistory,
    addSpaceOnMerge,
  });

  const activeTrack = useMemo(() => {
    if (!activeTrackId) {
      return null;
    }
    return tracks.find((track) => track.id === activeTrackId) ?? null;
  }, [tracks, activeTrackId]);

  const trackCount = tracks.length;
  const hasMultipleTracks = trackCount > 1;

  const getTrackById = useCallback(
    (id: string) => tracks.find((track) => track.id === id),
    [tracks],
  );

  const stateValue = useMemo(
    () => ({
      tracks,
      trackCount,
      hasMultipleTracks,
      activeTrack,
      getTrackById,
      activeTrackId,
      setActiveTrackId,
      showTrackLabels,
      setShowTrackLabels,
      showSubtitleDuration,
      setShowSubtitleDuration,
      addSpaceOnMerge,
      setAddSpaceOnMerge,
      clampOverlaps,
      setClampOverlaps,
      playInBackground,
      setPlayInBackground,
      rulesMaxLineLength,
      setRulesMaxLineLength,
      rulesMaxCps,
      setRulesMaxCps,
      rulesMinDurationMs,
      setRulesMinDurationMs,
      rulesMaxDurationMs,
      setRulesMaxDurationMs,
    }),
    [
      tracks,
      trackCount,
      hasMultipleTracks,
      activeTrack,
      getTrackById,
      activeTrackId,
      setActiveTrackId,
      showTrackLabels,
      setShowTrackLabels,
      showSubtitleDuration,
      setShowSubtitleDuration,
      addSpaceOnMerge,
      setAddSpaceOnMerge,
      clampOverlaps,
      setClampOverlaps,
      playInBackground,
      setPlayInBackground,
      rulesMaxLineLength,
      rulesMaxCps,
      rulesMinDurationMs,
      rulesMaxDurationMs,
    ],
  );

  const historyValue = useMemo(
    () => ({
      undoSubtitles,
      redoSubtitles,
      canUndoSubtitles,
      canRedoSubtitles,
    }),
    [undoSubtitles, redoSubtitles, canUndoSubtitles, canRedoSubtitles],
  );

  const timingState = useMemo(() => {
    const list = activeSubtitles.map((subtitle) => ({
      uuid: subtitle.uuid,
      start: timeToSeconds(subtitle.startTime),
      end: timeToSeconds(subtitle.endTime),
    }));
    const byUuid = new Map(list.map((entry) => [entry.uuid, entry]));
    return { list, byUuid };
  }, [activeSubtitles]);

  const localSessionValue = useMemo<LocalSessionValue>(
    () => ({
      pendingLocalSession,
      hasLocalSession,
      vimeoVideoId,
      setVimeoVideoId,
      restoreLocalSession,
      discardLocalSession,
      clearLocalSession,
      downloadLocalSessionBackup,
      skipAutoRestoreRef,
    }),
    [
      pendingLocalSession,
      hasLocalSession,
      vimeoVideoId,
      setVimeoVideoId,
      restoreLocalSession,
      discardLocalSession,
      clearLocalSession,
      downloadLocalSessionBackup,
      skipAutoRestoreRef,
    ],
  );

  return (
    <LocalSessionContext.Provider value={localSessionValue}>
      <SubtitleActionsContext.Provider value={subtitleActions}>
        <SubtitleHistoryContext.Provider value={historyValue}>
          <SubtitleStateContext.Provider value={stateValue}>
            <SubtitleTimingContext.Provider value={timingState}>
              <SubtitleDataContext.Provider value={activeSubtitles}>
                {children}
              </SubtitleDataContext.Provider>
            </SubtitleTimingContext.Provider>
          </SubtitleStateContext.Provider>
        </SubtitleHistoryContext.Provider>
      </SubtitleActionsContext.Provider>
    </LocalSessionContext.Provider>
  );
}
