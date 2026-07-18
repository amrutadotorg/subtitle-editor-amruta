"use client";

import { useSubtitles } from "@/context/subtitle-context"; // Import context
import {
  detectBrowserMediaSupport,
  type BrowserMediaSupport,
  type MediaFormatSupport,
} from "@/lib/media-support";
import { subtitlesToVttString } from "@/lib/format";
import { warnDev } from "@/lib/log";
import { CUE_PREVIEW_SEEK_OFFSET_SECONDS } from "@/lib/subtitle-playback";
import { shouldIgnorePauseWhileHidden } from "@/hooks/use-visibility-playback";
import { useTranslations } from "next-intl";
import {
  Fragment,
  type ForwardedRef,
  type SyntheticEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  IconBrandVimeo,
  IconUpload,
  IconAlertCircle,
  IconX,
} from "@tabler/icons-react";

export interface VimeoLoadingState {
  status: "downloading" | "error";
  progress: number | null; // 0-100, null = indeterminate
  filename?: string;
}

export interface VideoPlayerProps {
  mediaFile: File | null;
  setMediaFile: (file: File | null) => void;
  setMediaFileName: (name: string) => void;
  onProgress: (time: number) => void;
  onPlayPause: (playing: boolean) => void;
  onDuration: (duration: number) => void;
  seekTime: number;
  isPlaying: boolean;
  playbackRate: number;
  playInBackground: boolean;
  onOpenVimeo?: () => void;
  vimeoLoadingState?: VimeoLoadingState | null;
  /** Called when the user cancels an in-progress Vimeo auto-load (Cancel button or ESC) */
  onVimeoLoadCancel?: () => void;
}

export interface VideoPlayerHandle {
  resumePlayback: () => void;
}

const VideoPlayer = forwardRef(function VideoPlayer(
  {
    mediaFile,
    setMediaFile,
    setMediaFileName,
    onProgress,
    onPlayPause,
    onDuration,
    seekTime,
    isPlaying,
    playbackRate,
    playInBackground,
    onOpenVimeo,
    vimeoLoadingState,
    onVimeoLoadCancel,
  }: VideoPlayerProps,
  ref: ForwardedRef<VideoPlayerHandle>,
) {
  const t = useTranslations();
  // Get subtitles from context
  const subtitles = useSubtitles();

  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [vttUrl, setVttUrl] = useState<string | null>(null);
  const [browserMediaSupport, setBrowserMediaSupport] =
    useState<BrowserMediaSupport | null>(null);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const vttObjectUrlRef = useRef<string | null>(null);
  const timeToRestore = useRef<number | null>(null); // Ref to store time before remount

  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    playerRef.current = element;
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const audio = document.createElement("audio");
    const video = document.createElement("video");

    setBrowserMediaSupport(
      detectBrowserMediaSupport(
        audio.canPlayType.bind(audio),
        video.canPlayType.bind(video),
      ),
    );
  }, []);

  useEffect(() => {
    if (!vimeoLoadingState || !onVimeoLoadCancel) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onVimeoLoadCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [vimeoLoadingState, onVimeoLoadCancel]);

  const resumePlayback = useCallback(() => {
    const playerInstance = playerRef.current;
    if (!playerInstance) return;

    try {
      const playPromise = playerInstance.play?.();
      if (
        playPromise &&
        typeof (playPromise as Promise<void>).catch === "function"
      ) {
        (playPromise as Promise<void>).catch((error) => {
          if (
            error &&
            typeof error === "object" &&
            "name" in error &&
            (error as { name?: string }).name === "AbortError"
          ) {
            return;
          }
          warnDev("Failed to resume media playback:", error);
        });
      }
    } catch (error) {
      warnDev("Failed to resume media playback:", error);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    resumePlayback,
  }));

  useEffect(() => {
    if (typeof seekTime !== "number") return;
    // Always store the target time so handleLoadedMetadata can restore it
    timeToRestore.current = seekTime;
    if (playerRef.current) {
      const player = playerRef.current;
      const currentTime = player.currentTime ?? 0;
      const seekDelta = Math.abs(currentTime - seekTime);
      if (
        seekDelta > 0.5 ||
        (seekDelta > 0 && seekDelta <= CUE_PREVIEW_SEEK_OFFSET_SECONDS * 2)
      ) {
        player.currentTime = seekTime;
      }
    }
  }, [seekTime]);

  useEffect(() => {
    const node = playerRef.current;
    if (!node) return;
    if (isPlaying) {
      const playPromise = node.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } else {
      node.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!mediaFile) {
      setMediaUrl("");
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setMediaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  useEffect(() => {
    if (!mediaUrl) {
      setVttUrl(null);
      if (vttObjectUrlRef.current) {
        URL.revokeObjectURL(vttObjectUrlRef.current);
        vttObjectUrlRef.current = null;
      }
      return;
    }

    const vttString = subtitlesToVttString(subtitles);
    const blob = new Blob([vttString], { type: "text/vtt" });
    const objectUrl = URL.createObjectURL(blob);

    if (playerRef.current) {
      timeToRestore.current = playerRef.current.currentTime ?? null;
    }

    if (vttObjectUrlRef.current) {
      URL.revokeObjectURL(vttObjectUrlRef.current);
    }

    vttObjectUrlRef.current = objectUrl;
    setVttUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
      if (vttObjectUrlRef.current === objectUrl) {
        vttObjectUrlRef.current = null;
      }
    };
  }, [subtitles, mediaUrl]);

  const handleLoadedMetadata = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      playerRef.current = event.currentTarget;
      if (timeToRestore.current !== null) {
        event.currentTarget.currentTime = timeToRestore.current;
        timeToRestore.current = null;
      }
      if (Number.isFinite(event.currentTarget.duration)) {
        onDuration(event.currentTarget.duration);
      }
    },
    [onDuration],
  );

  const renderSupportedFormats = useCallback(
    (formats: MediaFormatSupport[]) => {
      if (formats.length === 0) {
        return (
          <span className="text-muted-foreground">
            {t("videoPlayer.supportedFormatsNone")}
          </span>
        );
      }

      return formats.map((format, index) => (
        <Fragment key={format.label}>
          {index > 0 ? ", " : null}
          <code>{format.label}</code>
          {format.support === "maybe" ? (
            <span className="text-muted-foreground">
              {" "}
              ({t("videoPlayer.supportedFormatsMaybe")})
            </span>
          ) : null}
        </Fragment>
      ));
    },
    [t],
  );

  if (!mediaUrl) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full text-muted-foreground">
        {/* Vimeo auto-load overlay */}
        {vimeoLoadingState && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm gap-4 px-8">
            {onVimeoLoadCancel && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4"
                onClick={onVimeoLoadCancel}
              >
                <IconX size={20} />
              </Button>
            )}
            {vimeoLoadingState.status === "downloading" ? (
              <>
                <IconBrandVimeo
                  size={36}
                  className="text-iris-700 dark:text-iris-300 animate-pulse"
                />
                <p className="text-base font-medium text-center">
                  {t("vimeoLoader.autoLoadDownloading")}
                  {vimeoLoadingState.filename && (
                    <span className="block text-sm text-muted-foreground mt-1 truncate max-w-xs">
                      {vimeoLoadingState.filename}
                    </span>
                  )}
                </p>
                <div className="w-full max-w-sm space-y-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    {vimeoLoadingState.progress !== null ? (
                      <div
                        className="h-full rounded-full bg-iris-700 dark:bg-iris-400 transition-all duration-200"
                        style={{ width: `${vimeoLoadingState.progress}%` }}
                      />
                    ) : (
                      <div className="h-full rounded-full bg-iris-700 dark:bg-iris-400 animate-[progress-indeterminate_1.5s_ease-in-out_infinite]" />
                    )}
                  </div>
                  {vimeoLoadingState.progress !== null && (
                    <p className="text-xs text-muted-foreground text-end tabular-nums">
                      {vimeoLoadingState.progress}%
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <IconAlertCircle size={36} className="text-red-500" />
                <p className="text-base font-medium text-center text-foreground">
                  {t("vimeoLoader.autoLoadError")}
                </p>
                {onOpenVimeo && (
                  <Button
                    variant="outline"
                    onClick={onOpenVimeo}
                    className="gap-2"
                  >
                    <IconBrandVimeo size={16} />
                    {t("vimeoLoader.autoLoadRetry")}
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        <Label className="cursor-pointer inline-flex items-center text-xl hover:text-accent-ink underline">
          <IconUpload size={24} className="mr-2" />
          {t("videoPlayer.loadFile")}
          <Input
            className="hidden"
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setMediaFile(file);
              setMediaFileName(file.name);
            }}
          />
        </Label>
        <div className="my-4 px-8 space-y-1 text-base">
          <p className="font-medium">{t("videoPlayer.supportedFormats")}</p>
          {browserMediaSupport ? (
            <>
              <p>
                <span className="font-semibold">
                  {t("videoPlayer.supportedFormatsAudio")}:
                </span>{" "}
                {renderSupportedFormats(browserMediaSupport.audio)}
              </p>
              <p>
                <span className="font-semibold">
                  {t("videoPlayer.supportedFormatsVideo")}:
                </span>{" "}
                {renderSupportedFormats(browserMediaSupport.video)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              {t("videoPlayer.supportedFormatsChecking")}
            </p>
          )}
          <p className="text-muted-foreground whitespace-pre-line">
            {t("videoPlayer.supportedFormatsNote")}
          </p>
          <p className="text-muted-foreground">
            {t("videoPlayer.supportedFormatsUnsupported")}
          </p>
          {onOpenVimeo && (
            <div className="flex justify-center w-full mt-4">
              <Button
                variant="link"
                className="text-xl hover:text-accent-ink underline"
                onClick={onOpenVimeo}
              >
                <IconBrandVimeo size={20} />
                <span>{t("videoPlayer.loadFromVimeo")}</span>
              </Button>
            </div>
          )}
        </div>
        <p className="text-muted-foreground text-sm mt-4 text-center">
          {(() => {
            const supportText = t("videoPlayer.supportInfo");
            const email = "help@amruta.org";
            if (!supportText.includes(email)) return supportText;
            const parts = supportText.split(email);
            return (
              <>
                {parts[0]}
                <a
                  href={`mailto:${email}`}
                  className="underline hover:text-accent-ink transition-colors"
                >
                  {email}
                </a>
                {parts[1]}
              </>
            );
          })()}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-black overflow-hidden">
      <video
        key={mediaUrl}
        ref={setVideoRef}
        src={mediaUrl}
        className="w-full h-full object-contain"
        playsInline
        preload="metadata"
        controls={false}
        controlsList="nodownload"
        onTimeUpdate={(event) => {
          const player = event.currentTarget;
          if (!player.seeking) {
            onProgress(player.currentTime);
          }
        }}
        onSeeked={(event) => {
          onProgress(event.currentTarget.currentTime);
        }}
        onPlay={() => onPlayPause(true)}
        onPause={() => {
          if (shouldIgnorePauseWhileHidden(playInBackground)) {
            return;
          }
          onPlayPause(false);
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleLoadedMetadata}
        onDurationChange={(event) => onDuration(event.currentTarget.duration)}
      >
        {vttUrl ? (
          <track
            key={vttUrl}
            kind="subtitles"
            src={vttUrl}
            label={t("videoPlayer.subtitles")}
            srcLang="unknown"
            default
          />
        ) : null}
      </video>
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
