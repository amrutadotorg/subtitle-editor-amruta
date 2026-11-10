"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { UndoHistory } from "@/hooks/use-undoable-state";
import {
  buildLocalSessionBackup,
  clearLocalSessionSnapshot,
  createLocalSessionSnapshot,
  getLocalSessionSignature,
  getLocalSessionBackupFilename,
  readLocalSessionSnapshot,
  saveSettingsToStorage,
  shouldAutosaveLocalSession,
  writeLocalSessionSnapshot,
  type LocalSessionPreferences,
  type LocalSessionSnapshot,
} from "@/lib/local-session";
import { createTrackHistory, EMPTY_HISTORY } from "@/lib/subtitle-history";
import {
  buildWorkspaceKey,
  clearLastPosition,
  readFreshestLastPosition,
  resolveResumeCandidate,
  selectResumeTrackId,
  type ResumeCandidate,
} from "@/lib/last-position";
import type { Subtitle, SubtitleTrack } from "@/types/subtitle";

const readRecoverableLocalSession = (): LocalSessionSnapshot | null => {
  const snapshot = readLocalSessionSnapshot();
  return snapshot && shouldAutosaveLocalSession(snapshot) ? snapshot : null;
};

interface UseLocalSessionOrchestrationParams {
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  preferences: LocalSessionPreferences;
  restoreSettings: (prefs: LocalSessionPreferences) => void;
  setTracks: Dispatch<SetStateAction<SubtitleTrack[]>>;
  setActiveTrackId: (id: string | null) => void;
  trackHistoriesRef: MutableRefObject<Map<string, UndoHistory<Subtitle[]>>>;
  setHistorySnapshot: (history: UndoHistory<Subtitle[]>) => void;
}

interface LocalSessionOrchestrationResult {
  pendingLocalSession: LocalSessionSnapshot | null;
  hasLocalSession: boolean;
  vimeoVideoId: string | null;
  setVimeoVideoId: (id: string | null) => void;
  restoreLocalSession: () => void;
  discardLocalSession: () => void;
  clearLocalSession: () => void;
  downloadLocalSessionBackup: (snapshot?: LocalSessionSnapshot | null) => void;
  skipAutoRestoreRef: MutableRefObject<boolean>;
  resumeTarget: ResumeCandidate | null;
  clearResumeTarget: () => void;
}

export function useLocalSessionOrchestration({
  tracks,
  activeTrackId,
  preferences,
  restoreSettings,
  setTracks,
  setActiveTrackId,
  trackHistoriesRef,
  setHistorySnapshot,
}: UseLocalSessionOrchestrationParams): LocalSessionOrchestrationResult {
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
  const suppressedAutosaveSignatureRef = useRef<string | null>(null);
  const skipAutoRestoreRef = useRef(false);
  const [resumeTarget, setResumeTarget] = useState<ResumeCandidate | null>(
    null,
  );
  const clearResumeTarget = useCallback(() => setResumeTarget(null), []);

  const currentWorkspaceKeys = useMemo(
    () =>
      vimeoVideoId
        ? [buildWorkspaceKey({ vimeoVideoId, trackName: null })]
        : tracks.map((track) =>
            buildWorkspaceKey({ vimeoVideoId: null, trackName: track.name }),
          ),
    [tracks, vimeoVideoId],
  );

  useEffect(() => {
    saveSettingsToStorage(preferences);
  }, [preferences]);

  const createCurrentLocalSession = useCallback(
    () =>
      createLocalSessionSnapshot({
        tracks,
        activeTrackId,
        preferences,
        vimeoVideoId: vimeoVideoId ?? undefined,
        lastPosition:
          readFreshestLastPosition(currentWorkspaceKeys) ?? undefined,
      }),
    [activeTrackId, currentWorkspaceKeys, preferences, tracks, vimeoVideoId],
  );
  const currentLocalSessionSignature = useMemo(
    () =>
      getLocalSessionSignature({
        tracks,
        activeTrackId,
        preferences,
      }),
    [activeTrackId, preferences, tracks],
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

    const restoredWorkspaceKeys = pendingLocalSession.vimeoVideoId
      ? [
          buildWorkspaceKey({
            vimeoVideoId: pendingLocalSession.vimeoVideoId,
            trackName: null,
          }),
        ]
      : nextTracks.map((track) =>
          buildWorkspaceKey({ vimeoVideoId: null, trackName: track.name }),
        );
    const mergedPosition = resolveResumeCandidate(
      readFreshestLastPosition(restoredWorkspaceKeys),
      pendingLocalSession.lastPosition,
      pendingLocalSession.savedAt,
    );
    // The stored position wins over the snapshot's active track, but only when
    // that track still exists and still contains the remembered cue.
    const resumeTrackId = selectResumeTrackId(
      nextTracks,
      mergedPosition,
      nextActiveTrackId,
    );
    const finalActiveTrackId = resumeTrackId ?? nextActiveTrackId;

    trackHistoriesRef.current = nextHistories;
    setTracks(nextTracks);
    setActiveTrackId(finalActiveTrackId);
    restoreSettings(pendingLocalSession.preferences);
    setHistorySnapshot(
      finalActiveTrackId
        ? (nextHistories.get(finalActiveTrackId) ?? EMPTY_HISTORY)
        : EMPTY_HISTORY,
    );
    setResumeTarget(mergedPosition);
    suppressedAutosaveSignatureRef.current = null;
    setPendingLocalSession(null);
    setHasLocalSession(true);
    setVimeoVideoIdState(pendingLocalSession.vimeoVideoId ?? null);
  }, [
    pendingLocalSession,
    setHistorySnapshot,
    restoreSettings,
    setTracks,
    setActiveTrackId,
    trackHistoriesRef,
  ]);

  const discardLocalSession = useCallback(() => {
    clearLocalSessionSnapshot();
    for (const workspaceKey of currentWorkspaceKeys) {
      clearLastPosition(workspaceKey);
    }
    suppressedAutosaveSignatureRef.current = null;
    skipAutoRestoreRef.current = true;
    setResumeTarget(null);
    setPendingLocalSession(null);
    setHasLocalSession(false);
  }, [currentWorkspaceKeys]);

  const clearLocalSession = useCallback(() => {
    suppressedAutosaveSignatureRef.current = currentLocalSessionSignature;
    clearLocalSessionSnapshot();
    clearLastPosition();
    setResumeTarget(null);
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

  return {
    pendingLocalSession,
    hasLocalSession,
    vimeoVideoId,
    setVimeoVideoId,
    restoreLocalSession,
    discardLocalSession,
    clearLocalSession,
    downloadLocalSessionBackup,
    skipAutoRestoreRef,
    resumeTarget,
    clearResumeTarget,
  };
}
