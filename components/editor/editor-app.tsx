"use client";

import { AppHeader } from "@/components/app-header";
import BottomInstructions from "@/components/bottom-instructions";
import type { BulkOffsetDrawerProps } from "@/components/bulk-offset/drawer";
import CustomControls from "@/components/custom-controls";
import LocalSessionRecovery from "@/components/local-session-recovery";
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
} from "@/context/subtitle-context";
import { SubtitleNavigationProvider } from "@/context/subtitle-navigation-context";
import { useActiveTrackDetails } from "@/hooks/use-active-track-details";
import { useBeforeUnloadGuard } from "@/hooks/use-beforeunload-guard";
import { useBulkOffsetState } from "@/hooks/use-bulk-offset-state";
import { useDroppablePanel } from "@/hooks/use-droppable-panel";
import { useMediaFile } from "@/hooks/use-media-file";
import { usePendingScroll } from "@/hooks/use-pending-scroll";
import { usePlaybackState } from "@/hooks/use-playback-state";
import { useSubtitleFileLoader } from "@/hooks/use-subtitle-file-loader";
import { useSubtitleShortcuts } from "@/hooks/use-subtitle-shortcuts";
import { usePlaybackVisibilityCoordinator } from "@/hooks/use-visibility-playback";
import { isMediaFile, isSubtitleFile } from "@/lib/file-utils";
import { getCachedFile, setCachedFile } from "@/lib/vimeo-file-cache";
import { cn, timeToSeconds } from "@/lib/utils";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { useEffect, useRef, useState } from "react";

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

  const {
    mediaFile,
    setMediaFile,
    mediaFileName,
    setMediaFileName,
    mediaFileInputRef,
    loadMediaFile,
  } = useMediaFile(t("buttons.loadMedia"));
  const { vimeoVideoId, setVimeoVideoId, pendingLocalSession, skipAutoRestoreRef } = useLocalSession();

  // Auto-restore cached Vimeo video after session restore
  const prevPendingSession = useRef(pendingLocalSession);
  useEffect(() => {
    const hadPending = prevPendingSession.current !== null;
    prevPendingSession.current = pendingLocalSession;
    if (hadPending && pendingLocalSession === null && vimeoVideoId && !mediaFile) {
      if (!skipAutoRestoreRef.current) {
        getCachedFile(vimeoVideoId).then((file) => {
          if (file) loadMediaFile(file);
        });
      }
      skipAutoRestoreRef.current = false;
    }
  }, [pendingLocalSession, vimeoVideoId, mediaFile, loadMediaFile, skipAutoRestoreRef]);
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

  const [editingSubtitleUuid, setEditingSubtitleUuid] = useState<string | null>(
    null,
  );
  const [isVimeoOpen, setIsVimeoOpen] = useState(false);
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
  const {
    isBulkOffsetOpen,
    toggleBulkOffset,
    bulkOffsetPreview,
    setBulkOffsetPreview,
  } = useBulkOffsetState({
    trackCount: tracks.length,
    disabled: bulkOffsetDisabled,
  });
  const { loadSubtitleFile, handleStartFromScratch } = useSubtitleFileLoader({
    activeTrackId,
    activeTrackIsEmpty,
    newSubtitleText: t("subtitle.newSubtitle"),
    newTrackName: t("subtitle.newTrackName", { number: 1 }),
    loadSubtitlesIntoTrack,
    renameTrack,
    setInitialSubtitles,
  });

  // Load shared file from URL query parameter (e.g. ?import=final_subtitles_xyz.vtt)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const sharedFile = searchParams.get("import");
    if (sharedFile && !hasImportedRef.current) {
      hasImportedRef.current = true;

      // Clear previous auto-saved session to prevent recovery dialog from overlapping newly loaded file
      try {
        localStorage.removeItem("subtitle-editor:autosave:v1");
      } catch (err) {
        console.warn("Failed to clear local session storage:", err);
      }

      fetch(`/api/load-shared?file=${encodeURIComponent(sharedFile)}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load shared subtitles file");
          return res.text();
        })
        .then((text) => {
          const ytid = searchParams.get("ytid");
          const lang = searchParams.get("lang");
          let fileName = sharedFile;
          if (ytid) {
            fileName = lang ? `${ytid}.${lang}.vtt` : `${ytid}.vtt`;
          }
          const file = new File([text], fileName, { type: "text/vtt" });
          shouldJumpToFirstRef.current = true;
          loadSubtitleFile(file);

          // Load Vimeo video if vimeo_id param is present
          const vimeoId = searchParams.get("vimeo_id");
          if (vimeoId) {
            setVimeoVideoId(vimeoId);
            getCachedFile(vimeoId).then((cachedFile) => {
              if (cachedFile) {
                loadMediaFile(cachedFile);
              } else {
                // Not cached — download from Vimeo API
                fetch(`/api/vimeo/download?url=${encodeURIComponent(`https://vimeo.com/${vimeoId}`)}`)
                  .then((res) => {
                    if (!res.ok) throw new Error(`Vimeo download failed (${res.status})`);
                    const reader = res.body!.getReader();
                    const chunks: Uint8Array[] = [];
                    const pump = (): Promise<void> =>
                      reader.read().then(({ done, value }) => {
                        if (done) return;
                        chunks.push(value);
                        return pump();
                      });
                    return pump().then(() => {
                      const totalLen = chunks.reduce((n, c) => n + c.length, 0);
                      const merged = new Uint8Array(totalLen);
                      let offset = 0;
                      for (const chunk of chunks) {
                        merged.set(chunk, offset);
                        offset += chunk.length;
                      }
                      const contentType = res.headers.get("content-type") ?? "video/mp4";
                      const filename =
                        res.headers.get("content-disposition")?.match(/filename="(.+?)"/)?.[1] ?? `vimeo-${vimeoId}.mp4`;
                      const blob = new Blob([merged], { type: contentType });
                      const file = new File([blob], filename, { type: contentType });
                      setCachedFile(vimeoId, file);
                      loadMediaFile(file);
                    });
                  })
                  .catch((err) => console.error("Vimeo auto-load failed:", err));
              }
            });
          }

          // Clean up URL query parameters to avoid duplicate imports on re-renders
          const url = new URL(window.location.href);
          url.searchParams.delete("import");
          url.searchParams.delete("vimeo_id");
          window.history.replaceState({}, "", url.toString());
        })
        .catch((err) => {
          console.error("Error loading shared subtitle file:", err);
          hasImportedRef.current = false;
        });
    }
  }, [loadSubtitleFile]);

  // After import: jump to first subtitle (seek + scroll + focus, no auto-play)
  useEffect(() => {
    if (!shouldJumpToFirstRef.current || subtitles.length === 0) return;
    shouldJumpToFirstRef.current = false;
    const first = subtitles[0];
    pendingSeekRef.current = timeToSeconds(first.startTime);
    requestScroll(first.uuid, { instant: true });
  }, [subtitles, requestScroll]);

  useBeforeUnloadGuard(canUndoSubtitles);
  usePlaybackVisibilityCoordinator({
    playInBackground,
    isPlaying,
    setIsPlaying,
    videoPlayerRef,
    waveformRef,
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
  };

  return (
    <SubtitleNavigationProvider value={{ navigateToSubtitle }}>
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
        isVimeoOpen={isVimeoOpen}
        onSetVimeoOpen={setIsVimeoOpen}
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
                isBulkOffsetOpen && "pointer-events-none blur-[1px] opacity-40",
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
                }}
                onTimeJump={jumpBy}
                jumpDuration={jumpDuration}
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
              "w-full md:w-1/2 min-h-[32vh] md:min-h-0 border-t-2 md:border-t-0 md:border-l-2 border-black dark:border-white transition-colors",
              isMediaDragActive && "bg-iris-100",
            )}
            {...mediaDropHandlers}
          >
            <VideoPlayer
              ref={videoPlayerRef}
              mediaFile={mediaFile}
              setMediaFile={setMediaFile}
              setMediaFileName={setMediaFileName}
              onProgress={(time) => {
                setPlaybackTime(time);
                waveformRef.current?.setWaveformTime(time);
              }}
              onPlayPause={(playing) => setIsPlaying(playing)}
              onDuration={(duration) => {
                setDuration(duration);
                // Apply pending seek from import (after video is loaded)
                if (pendingSeekRef.current !== null) {
                  setPlaybackTime(pendingSeekRef.current);
                  pendingSeekRef.current = null;
                }
              }}
              seekTime={playbackTime}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              playInBackground={playInBackground}
              onOpenVimeo={() => setIsVimeoOpen(true)}
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
