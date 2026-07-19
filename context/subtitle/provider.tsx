"use client";

import { useSubtitleActions } from "@/hooks/use-subtitle-actions";
import { useUndoableState, type UndoHistory } from "@/hooks/use-undoable-state";
import {
  createTrackHistory,
  historiesAreEqual,
  isHistoryEmpty,
  subtitlesAreEqual,
  EMPTY_HISTORY,
} from "@/lib/subtitle-history";
import {
  buildLocalSessionBackup,
  clearLocalSessionSnapshot,
  createLocalSessionSnapshot,
  getLocalSessionSignature,
  getLocalSessionBackupFilename,
  loadSettingsFromStorage,
  readLocalSessionSnapshot,
  saveSettingsToStorage,
  shouldAutosaveLocalSession,
  writeLocalSessionSnapshot,
  type LocalSessionPreferences,
  type LocalSessionSnapshot,
} from "@/lib/local-session";
import { timeToSeconds } from "@/lib/utils";
import type { SubtitleTrack } from "@/types/subtitle";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SubtitleProviderProps, LocalSessionValue } from "./types";
import { SubtitleStateContext } from "./state";
import { SubtitleActionsContext } from "./actions";
import { SubtitleHistoryContext } from "./history";
import { SubtitleDataContext } from "./data";
import { SubtitleTimingContext } from "./timing";
import { LocalSessionContext } from "./local-session";

const readRecoverableLocalSession = (): LocalSessionSnapshot | null => {
  const snapshot = readLocalSessionSnapshot();
  return snapshot && shouldAutosaveLocalSession(snapshot) ? snapshot : null;
};

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
  const [pendingLocalSession, setPendingLocalSession] =
    useState<LocalSessionSnapshot | null>(() => readRecoverableLocalSession());
  const [hasLocalSession, setHasLocalSession] = useState(
    () => readRecoverableLocalSession() !== null,
  );
  const [vimeoVideoId, setVimeoVideoIdState] = useState<string | null>(
    () => readRecoverableLocalSession()?.vimeoVideoId ?? null,
  );
  const setVimeoVideoId = useCallback((id: string | null) => {
    setVimeoVideoIdState(id);
  }, []);
  const previousActiveTrackId = useRef<string | null>(null);
  const suppressedAutosaveSignatureRef = useRef<string | null>(null);
  const skipAutoRestoreRef = useRef(false);
  const trackHistoriesRef = useRef<
    Map<string, UndoHistory<SubtitleTrack["subtitles"]>>
  >(new Map());

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

  const localSessionPreferences = useMemo<LocalSessionPreferences>(
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

  useEffect(() => {
    saveSettingsToStorage(localSessionPreferences);
  }, [localSessionPreferences]);

  const createCurrentLocalSession = useCallback(
    () =>
      createLocalSessionSnapshot({
        tracks,
        activeTrackId,
        preferences: localSessionPreferences,
        vimeoVideoId: vimeoVideoId ?? undefined,
      }),
    [activeTrackId, localSessionPreferences, tracks, vimeoVideoId],
  );
  const currentLocalSessionSignature = useMemo(
    () =>
      getLocalSessionSignature({
        tracks,
        activeTrackId,
        preferences: localSessionPreferences,
      }),
    [activeTrackId, localSessionPreferences, tracks],
  );

  useEffect(() => {
    if (pendingLocalSession) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (
        suppressedAutosaveSignatureRef.current === currentLocalSessionSignature
      ) {
        return;
      }

      const snapshot = createCurrentLocalSession();
      if (shouldAutosaveLocalSession(snapshot)) {
        const didWrite = writeLocalSessionSnapshot(snapshot);
        if (didWrite) {
          suppressedAutosaveSignatureRef.current = null;
          setHasLocalSession(true);
        }
        return;
      }

      const didClear = clearLocalSessionSnapshot();
      if (didClear) {
        setHasLocalSession(false);
      }
    }, 750);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    createCurrentLocalSession,
    currentLocalSessionSignature,
    pendingLocalSession,
  ]);

  const restoreLocalSession = useCallback(() => {
    if (!pendingLocalSession) {
      return;
    }

    const nextHistories = new Map<
      string,
      UndoHistory<SubtitleTrack["subtitles"]>
    >();
    const nextTracks = pendingLocalSession.tracks.map((track) => {
      const history = createTrackHistory(track.id, track.subtitles);
      nextHistories.set(track.id, history);
      return {
        ...track,
        subtitles: history.present,
        vttPrologue: track.vttPrologue ? [...track.vttPrologue] : undefined,
      };
    });
    const nextActiveTrackId =
      pendingLocalSession.activeTrackId &&
      nextTracks.some((track) => track.id === pendingLocalSession.activeTrackId)
        ? pendingLocalSession.activeTrackId
        : (nextTracks[0]?.id ?? null);

    trackHistoriesRef.current = nextHistories;
    setTracks(nextTracks);
    setActiveTrackId(nextActiveTrackId);
    setShowTrackLabels(pendingLocalSession.preferences.showTrackLabels);
    setShowSubtitleDuration(
      pendingLocalSession.preferences.showSubtitleDuration,
    );
    setAddSpaceOnMerge(pendingLocalSession.preferences.addSpaceOnMerge);
    setClampOverlaps(pendingLocalSession.preferences.clampOverlaps);
    setPlayInBackground(pendingLocalSession.preferences.playInBackground);
    setRulesMaxLineLength(
      pendingLocalSession.preferences.rulesMaxLineLength ?? 42,
    );
    setRulesMaxCps(pendingLocalSession.preferences.rulesMaxCps ?? 25);
    setRulesMinDurationMs(
      pendingLocalSession.preferences.rulesMinDurationMs ?? 1000,
    );
    setRulesMaxDurationMs(
      pendingLocalSession.preferences.rulesMaxDurationMs ?? 8000,
    );
    setHistorySnapshot(
      nextActiveTrackId
        ? (nextHistories.get(nextActiveTrackId) ?? EMPTY_HISTORY)
        : EMPTY_HISTORY,
    );
    suppressedAutosaveSignatureRef.current = null;
    setPendingLocalSession(null);
    setHasLocalSession(true);
    setVimeoVideoIdState(pendingLocalSession.vimeoVideoId ?? null);
  }, [pendingLocalSession, setHistorySnapshot]);

  const discardLocalSession = useCallback(() => {
    clearLocalSessionSnapshot();
    suppressedAutosaveSignatureRef.current = null;
    skipAutoRestoreRef.current = true;
    setPendingLocalSession(null);
    setHasLocalSession(false);
  }, []);

  const clearLocalSession = useCallback(() => {
    suppressedAutosaveSignatureRef.current = currentLocalSessionSignature;
    clearLocalSessionSnapshot();
    setPendingLocalSession(null);
    setHasLocalSession(false);
  }, [currentLocalSessionSignature]);

  const downloadLocalSessionBackup = useCallback(
    (snapshot?: LocalSessionSnapshot | null) => {
      const session =
        snapshot ?? pendingLocalSession ?? createCurrentLocalSession();
      if (!session || !shouldAutosaveLocalSession(session)) {
        return;
      }

      const blob = new Blob([buildLocalSessionBackup(session)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getLocalSessionBackupFilename(session);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [createCurrentLocalSession, pendingLocalSession],
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
  }, [activeTrackId, activeSubtitles]);

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
