"use client";

import { AppHeader } from "@/components/app-header";
import BottomInstructions from "@/components/bottom-instructions";
import type { BulkOffsetDrawerProps } from "@/components/bulk-offset/drawer";
import CustomControls from "@/components/custom-controls";
import LocalSessionRecovery from "@/components/local-session-recovery";
import OverlapReportDialog from "@/components/overlap-report/overlap-report-dialog";
import SkipLinks from "@/components/skip-links";
import type { SubtitleListRef } from "@/components/subtitle/subtitle-list";
import TrackTabs from "@/components/subtitle/track-tabs";
import type {
  VideoPlayerHandle,
  VideoPlayerProps,
} from "@/components/video-player";
import {
  SubtitleProvider,
  useLocalSession,
  useSubtitleActionsContext,
  useSubtitleHistory,
  useSubtitleState,
  useSubtitles,
  useSubtitleTimings,
} from "@/context/subtitle";
import { errorDev, warnDev } from "@/lib/log";
import { buildWorkspaceKey } from "@/lib/last-position";
import type { OverlapReport } from "@/lib/overlap-report";
import { getCuePreviewSeekTime } from "@/lib/subtitle-playback";
import { computeLocalMediaPeaksKey } from "@/lib/waveform-peaks-cache";
import { SubtitleNavigationProvider } from "@/context/subtitle-navigation-context";
import { useActiveTrackDetails } from "@/hooks/use-active-track-details";
import { useBeforeUnloadGuard } from "@/hooks/use-beforeunload-guard";
import { useBulkOffsetState } from "@/hooks/use-bulk-offset-state";
import { useDroppablePanel } from "@/hooks/use-droppable-panel";
import { useLegacyCacheCleanup } from "@/hooks/use-legacy-cache-cleanup";
import { useMediaFile } from "@/hooks/use-media-file";
import { usePendingScroll } from "@/hooks/use-pending-scroll";
import { usePlaybackState } from "@/hooks/use-playback-state";
import { useResumeCursor } from "@/hooks/use-resume-cursor";
import { useSubtitleFileLoader } from "@/hooks/use-subtitle-file-loader";
import { useToast } from "@/hooks/use-toast";
import { useSubtitleShortcuts } from "@/hooks/use-subtitle-shortcuts";
import { usePlaybackVisibilityCoordinator } from "@/hooks/use-visibility-playback";
import { isMediaFile, isSubtitleFile } from "@/lib/file-utils";
import { cn, timeToSeconds } from "@/lib/utils";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSharedSubtitleUrlLoader } from "@/hooks/use-shared-subtitle-url-loader";
import { useAutoJumpToFirstSubtitle } from "@/hooks/use-auto-jump-to-first-subtitle";

const VideoPlayer = dynamic<VideoPlayerProps>(
  () => import("@/components/video-player"),
  {
    ssr: false, // Disable server-side rendering
  },
) as ForwardRefExoticComponent<
  VideoPlayerProps & RefAttributes<VideoPlayerHandle>
>;

const WaveformVisualizer = dynamic(
  () => import("@/components/waveform-visualizer"),
  {
    ssr: false, // Disable server-side rendering
  },
);

const BulkOffsetDrawer = dynamic<BulkOffsetDrawerProps>(
  () =>
    import("@/components/bulk-offset/drawer").then(
      (mod) => mod.BulkOffsetDrawer,
    ),
  {
    loading: () => null,
    ssr: false,
  },
);

interface WaveformRef {
  resumePlayback: () => void;
  scrollToRegion: (uuid: string) => void;
  setWaveformTime: (time: number) => void;
}

function MainContent() {
  const t = useTranslations();
  const waveformRef = useRef<WaveformRef>(null);
  const subtitleListRef = useRef<SubtitleListRef>(null);
  const videoPlayerRef = useRef<VideoPlayerHandle | null>(null);
  const hasImportedRef = useRef(false);
  const shouldJumpToFirstRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const { tracks, activeTrackId, setActiveTrackId, playInBackground } =
    useSubtitleState();
  const subtitles = useSubtitles();
  const {
    setInitialSubtitles,
    loadSubtitlesIntoTrack,
    renameTrack,
    bulkShiftSubtitlesAction,
    addSubtitleAction,
  } = useSubtitleActionsContext();
  const { undoSubtitles, redoSubtitles, canUndoSubtitles, canRedoSubtitles } =
    useSubtitleHistory();

  const { mediaFile, mediaFileName, mediaFileInputRef, loadMediaFile } =
    useMediaFile(t("buttons.loadMedia"));
  const {
    pendingLocalSession,
    skipAutoRestoreRef,
    resumeTarget,
    clearResumeTarget,
  } = useLocalSession();
  const {
    playbackTime,
    setPlaybackTime,
    isPlaying,
    setIsPlaying,
    duration,
    setDuration,
    playbackRate,
    setPlaybackRate,
    jumpDuration,
    setJumpDuration,
    jumpBy,
  } = usePlaybackState();
  const { requestScroll } = usePendingScroll(subtitleListRef);
  const { list: subtitleTimings } = useSubtitleTimings();

  // Drop the orphaned Vimeo IndexedDB database (removed feature) once per load.
  useLegacyCacheCleanup();

  const [editingSubtitleUuid, setEditingSubtitleUuid] = useState<string | null>(
    null,
  );
  const [overlapReport, setOverlapReport] = useState<OverlapReport | null>(
    null,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has("vimeo_id") || searchParams.has("vimeo_id_url")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("vimeo_id");
      url.searchParams.delete("vimeo_id_url");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  const resumeMediaPlayback = () => {
    videoPlayerRef.current?.resumePlayback();
  };

  const {
    activeTrackIndex,
    activeTrack,
    activeTrackSubtitles,
    activeTrackIsEmpty,
    allowSubtitleDrop,
    bulkOffsetDisabled,
  } = useActiveTrackDetails(tracks, activeTrackId);

  const workspaceKey = useMemo(
    () =>
      buildWorkspaceKey({
        trackName: activeTrack?.name ?? null,
      }),
    [activeTrack?.name],
  );

  const peaksCacheKey = useMemo(
    () => (mediaFile ? computeLocalMediaPeaksKey(mediaFile) : null),
    [mediaFile],
  );

  const { resumeUuid, recordInteraction, clearResumeHighlight } =
    useResumeCursor({
      enabled: pendingLocalSession === null && subtitles.length > 0,
      workspaceKey,
      isPlaying,
      playbackTime,
      mediaKey: mediaFile ? `${mediaFile.name}:${mediaFile.size}` : null,
      trackId: activeTrackId,
      subtitleTimings,
      resumeTarget,
      clearResumeTarget,
      setPlaybackTime,
      pendingSeekRef,
      requestScroll,
      editingSubtitleUuid,
      activeTrackId,
    });

  const {
    isBulkOffsetOpen,
    toggleBulkOffset,
    bulkOffsetPreview,
    setBulkOffsetPreview,
  } = useBulkOffsetState({
    trackCount: tracks.length,
    disabled: bulkOffsetDisabled,
  });

  const { toast } = useToast();

  const handleImportedReport = useCallback(
    (report: OverlapReport, trackId: string) => {
      // Ticket #27: a clean imported file never opens the dialog, even if some
      // other track already had overlaps. The dialog still shows the whole
      // workspace when it does open.
      const counts = report.countsByTrack[trackId];
      if (!counts || (counts.overlaps === 0 && counts.invalid === 0)) {
        return;
      }
      setOverlapReport(report);
    },
    [],
  );

  const handleEmptyImport = useCallback(() => {
    // A URL import sets the jump flag before parsing; clear it when nothing loaded.
    shouldJumpToFirstRef.current = false;
    toast({
      title: t("validation.invalidSubtitleFileTitle"),
      description: t("validation.invalidSubtitleFileDescription"),
      variant: "destructive",
    });
  }, [t, toast]);

  // Every import path (header Load, drop, both pickers, URL) runs through this
  // one loader; its report/empty callbacks are the single post-import seam.
  const { loadSubtitleFile, handleStartFromScratch } = useSubtitleFileLoader({
    activeTrackId,
    activeTrackIsEmpty,
    tracks,
    newSubtitleText: t("subtitle.newSubtitle"),
    newTrackName: t("subtitle.newTrackName", { number: 1 }),
    loadSubtitlesIntoTrack,
    renameTrack,
    setInitialSubtitles,
    onImported: handleImportedReport,
    onEmpty: handleEmptyImport,
  });

  // Load shared file from URL query parameter (e.g. ?import=final_subtitles_xyz.vtt)
  useSharedSubtitleUrlLoader({
    loadSubtitleFile,
    shouldJumpToFirstRef,
  });

  // After import: jump to first subtitle (seek + scroll + focus, no auto-play)
  useAutoJumpToFirstSubtitle({
    subtitles,
    shouldJumpToFirstRef,
    pendingSeekRef,
    requestScroll,
  });

  useBeforeUnloadGuard(canUndoSubtitles);
  usePlaybackVisibilityCoordinator({
    playInBackground,
    isPlaying,
    setIsPlaying,
    videoPlayerRef,
    waveformRef,
    onTimeSync: useCallback(
      (time: number) => {
        setPlaybackTime(time);
        waveformRef.current?.setWaveformTime(time);
        if (typeof document !== "undefined") {
          (document.activeElement as HTMLElement | null)?.blur?.();
        }
        setEditingSubtitleUuid(null);
      },
      [setPlaybackTime, setEditingSubtitleUuid],
    ),
  });

  const {
    isDragActive: isSubtitleDragActive,
    panelProps: baseSubtitleDropHandlers,
  } = useDroppablePanel<HTMLDivElement>({
    acceptFile: (file: File) => allowSubtitleDrop && isSubtitleFile(file),
    canDrop: allowSubtitleDrop,
    onDropFile: loadSubtitleFile,
  });

  const { isDragActive: isMediaDragActive, panelProps: mediaDropHandlers } =
    useDroppablePanel<HTMLDivElement>({
      acceptFile: isMediaFile,
      onDropFile: loadMediaFile,
    });

  useSubtitleShortcuts({
    subtitles,
    playbackTime,
    setIsPlaying,
    setEditingSubtitleUuid,
    tracks,
    activeTrackId: activeTrackId ?? null,
    setActiveTrackId,
    canUndoSubtitles,
    canRedoSubtitles,
    undoSubtitles,
    redoSubtitles,
    addSubtitleAction,
  });

  const navigateToSubtitle = (uuid: string) => {
    subtitleListRef.current?.scrollToSubtitle(uuid, { instant: true });
    waveformRef.current?.scrollToRegion(uuid);
    recordInteraction(uuid);
    clearResumeHighlight();
  };

  const navigateToSubtitleInTrack = (trackId: string, uuid: string) => {
    const target = tracks
      .find((track) => track.id === trackId)
      ?.subtitles.find((subtitle) => subtitle.uuid === uuid);
    if (!target) return;

    const previewTime = getCuePreviewSeekTime(
      timeToSeconds(target.startTime),
      timeToSeconds(target.endTime),
    );

    if (activeTrackId !== trackId) {
      setActiveTrackId(trackId);
      // The inactive panel is unmounted; the retry queue scrolls it once it mounts.
      requestScroll(uuid, { instant: true });
    } else {
      subtitleListRef.current?.scrollToSubtitle(uuid, { instant: true });
    }

    // The waveform region map spans every track, so this works before the switch lands.
    waveformRef.current?.scrollToRegion(uuid);
    setPlaybackTime(previewTime);
    pendingSeekRef.current = previewTime;
    recordInteraction(uuid);
    clearResumeHighlight();
  };

  return (
    <SubtitleNavigationProvider
      value={{ navigateToSubtitle, navigateToSubtitleInTrack }}
    >
      <div className="flex flex-col min-h-screen md:h-screen">
        <SkipLinks />
        <AppHeader
          canUndo={canUndoSubtitles}
          canRedo={canRedoSubtitles}
          onUndo={undoSubtitles}
          onRedo={redoSubtitles}
          mediaFileInputRef={mediaFileInputRef}
          onSelectMediaFile={loadMediaFile}
          mediaFileName={mediaFileName}
          isBulkOffsetOpen={isBulkOffsetOpen}
          onToggleBulkOffset={toggleBulkOffset}
          bulkOffsetDisabled={bulkOffsetDisabled}
          onLoadSubtitleFile={loadSubtitleFile}
        />

        <OverlapReportDialog
          open={overlapReport !== null}
          onOpenChange={(open) => {
            if (!open) setOverlapReport(null);
          }}
          report={overlapReport}
          tracks={tracks}
          onNavigate={navigateToSubtitleInTrack}
        />

        <div className="flex-1 flex flex-col">
          <div className="flex flex-col md:flex-row min-h-[64vh] md:h-[64vh]">
            <div
              className={cn(
                "relative w-full md:w-1/2 min-h-[32vh] md:min-h-0 transition-colors",
                isSubtitleDragActive && allowSubtitleDrop && "bg-iris-100",
              )}
              {...baseSubtitleDropHandlers}
            >
              <div
                className={cn(
                  "h-full transition",
                  isBulkOffsetOpen &&
                    "pointer-events-none blur-[1px] opacity-40",
                )}
              >
                <TrackTabs
                  tracks={tracks}
                  activeTrackId={activeTrackId}
                  setActiveTrackId={setActiveTrackId}
                  subtitleListRef={subtitleListRef}
                  playbackTime={playbackTime}
                  isPlaying={isPlaying}
                  resumePlayback={resumeMediaPlayback}
                  setIsPlaying={setIsPlaying}
                  setPlaybackTime={setPlaybackTime}
                  editingSubtitleUuid={editingSubtitleUuid}
                  setEditingSubtitleUuid={setEditingSubtitleUuid}
                  onScrollToRegion={(uuid) => {
                    if (waveformRef.current) {
                      waveformRef.current.scrollToRegion(uuid);
                    }
                    recordInteraction(uuid);
                    clearResumeHighlight();
                  }}
                  onTimeJump={jumpBy}
                  jumpDuration={jumpDuration}
                  resumeUuid={resumeUuid}
                  onLoadSubtitleFile={loadSubtitleFile}
                  onStartFromScratch={handleStartFromScratch}
                />
              </div>

              {isBulkOffsetOpen && tracks.length > 0 && (
                <BulkOffsetDrawer
                  isOpen={isBulkOffsetOpen}
                  subtitles={activeTrackSubtitles}
                  trackIndex={activeTrackIndex}
                  currentTrackName={activeTrack?.name ?? null}
                  onPreviewChange={setBulkOffsetPreview}
                  onApplyOffset={(selection, offsetSeconds, target) => {
                    bulkShiftSubtitlesAction(selection, offsetSeconds, target);
                  }}
                />
              )}
            </div>

            <div
              className={cn(
                "w-full md:w-1/2 min-h-[32vh] md:min-h-0 border-t-2 md:border-t-0 md:border-s-2 border-black dark:border-white transition-colors",
                isMediaDragActive && "bg-iris-100",
              )}
              {...mediaDropHandlers}
            >
              <VideoPlayer
                ref={videoPlayerRef}
                mediaFile={mediaFile}
                onLoadMediaFile={loadMediaFile}
                onProgress={(time) => {
                  setPlaybackTime(time);
                  waveformRef.current?.setWaveformTime(time);
                }}
                onPlayPause={(playing) => setIsPlaying(playing)}
                onDuration={(duration) => {
                  setDuration(duration);
                  // Apply pending seek from import (after video is loaded)
                  if (pendingSeekRef.current !== null) {
                    const targetTime = pendingSeekRef.current;
                    setPlaybackTime(targetTime);
                    waveformRef.current?.setWaveformTime(targetTime);
                    pendingSeekRef.current = null;
                  }
                }}
                seekTime={playbackTime}
                isPlaying={isPlaying}
                playbackRate={playbackRate}
                playInBackground={playInBackground}
              />
            </div>
          </div>

          <div className="min-h-[21vh] md:h-[21vh]">
            {mediaFile ? (
              <>
                <CustomControls
                  isPlaying={isPlaying}
                  playbackTime={playbackTime}
                  duration={duration}
                  onPlayPause={() => setIsPlaying(!isPlaying)}
                  onTimeJump={jumpBy}
                  jumpDuration={jumpDuration}
                  onChangeJumpDuration={(seconds) =>
                    setJumpDuration(Number.parseInt(seconds))
                  }
                  onSeek={(time) => setPlaybackTime(time)}
                  playbackRate={playbackRate}
                  onChangePlaybackRate={(rate) =>
                    setPlaybackRate(Number.parseFloat(rate))
                  }
                />
                <WaveformVisualizer
                  ref={waveformRef}
                  mediaFile={mediaFile}
                  peaksCacheKey={peaksCacheKey}
                  isPlaying={isPlaying}
                  playInBackground={playInBackground}
                  onSeek={setPlaybackTime}
                  onPlayPause={setIsPlaying}
                  previewOffsets={bulkOffsetPreview}
                  onRegionClick={(uuid, opts) => {
                    requestScroll(uuid, { instant: Boolean(opts?.crossTrack) });
                  }}
                />
              </>
            ) : (
              <BottomInstructions />
            )}
          </div>
        </div>
      </div>
    </SubtitleNavigationProvider>
  );
}

export default function EditorApp() {
  return (
    <SubtitleProvider>
      <LocalSessionRecovery />
      <MainContent />
    </SubtitleProvider>
  );
}
