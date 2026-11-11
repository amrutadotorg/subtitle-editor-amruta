"use client";

import { useEffect, useState } from "react";
import { extractPeaks } from "@/lib/audio-peaks";
import { warnDev } from "@/lib/log";
import { getCachedPeaks, setCachedPeaks } from "@/lib/waveform-peaks-cache";

interface UseWaveformPeaksParams {
  mediaFile: File | null;
  peaksCacheKey?: string | null;
  setIsLoading: (loading: boolean) => void;
}

interface UseWaveformPeaksResult {
  mediaUrl: string;
  isLargeFile: boolean;
  extractedPeaks: Float32Array[] | undefined;
  extractedDuration: number | undefined;
  extractionProgress: number;
  isExtracting: boolean;
}

export function useWaveformPeaks({
  mediaFile,
  peaksCacheKey,
  setIsLoading,
}: UseWaveformPeaksParams): UseWaveformPeaksResult {
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [isLargeFile, setIsLargeFile] = useState(false);
  const [extractedPeaks, setExtractedPeaks] = useState<
    Float32Array[] | undefined
  >(undefined);
  const [extractedDuration, setExtractedDuration] = useState<
    number | undefined
  >(undefined);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    if (!mediaFile) {
      setMediaUrl("");
      setExtractedPeaks(undefined);
      setExtractedDuration(undefined);
      setExtractionProgress(0);
      setIsExtracting(false);
      setIsLargeFile(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    // Reset immediately so the previous file's waveform never lingers while
    // the new peaks are being loaded/extracted.
    setExtractedPeaks(undefined);
    setExtractedDuration(undefined);
    setExtractionProgress(0);
    setIsExtracting(false);
    setIsLoading(false);

    const isStale = () => cancelled || controller.signal.aborted;

    const attachMediaUrl = () => {
      const objectUrl = URL.createObjectURL(mediaFile);
      if (isStale()) {
        // The URL never reaches state, so the cleanup below cannot revoke it.
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setMediaUrl(objectUrl);
    };

    const large = mediaFile.size > 100 * 1024 * 1024;
    setIsLargeFile(large);

    const isMp4 = mediaFile.name.toLowerCase().match(/\.(mp4|m4a|mov)$/);

    if (large && isMp4) {
      const runExtraction = (skipCache = false) => {
        if (!skipCache && peaksCacheKey) {
          getCachedPeaks(peaksCacheKey).then((cached) => {
            if (isStale()) return;
            if (cached) {
              setExtractedPeaks(cached.peaks);
              setExtractedDuration(cached.duration);
              attachMediaUrl();
            } else {
              runExtraction(true);
            }
          });
          return;
        }

        if (isStale()) return;

        setIsExtracting(true);
        setExtractionProgress(0);

        extractPeaks(
          mediaFile,
          (percent: number) => {
            if (isStale()) return;
            setExtractionProgress(percent);
          },
          controller.signal,
        )
          .then(({ peaks, duration }) => {
            if (isStale()) return;
            setExtractedPeaks([peaks]);
            setExtractedDuration(duration);
            setIsExtracting(false);
            if (peaksCacheKey) {
              // Never rejects (best-effort cache).
              setCachedPeaks(peaksCacheKey, peaks, duration);
            }
            attachMediaUrl();
          })
          .catch((e: unknown) => {
            if (isStale()) return;
            if ((e as Error | undefined)?.name === "AbortError") return;
            warnDev("Peak extraction failed, falling back to dummy peaks:", e);
            setExtractedPeaks([new Float32Array([0])]);
            setExtractedDuration(undefined);
            setIsExtracting(false);
            attachMediaUrl();
          });
      };

      runExtraction();
    } else if (large) {
      setExtractedPeaks([new Float32Array([0])]);
      setExtractedDuration(undefined);
      attachMediaUrl();
    } else {
      setExtractedPeaks(undefined);
      setExtractedDuration(undefined);
      attachMediaUrl();
      // WaveSurfer decodes this file itself; keep the spinner until "ready".
      setIsLoading(true);
    }

    return () => {
      cancelled = true;
      controller.abort();
      setMediaUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return "";
      });
    };
  }, [mediaFile, peaksCacheKey, setIsLoading]);

  return {
    mediaUrl,
    isLargeFile,
    extractedPeaks,
    extractedDuration,
    extractionProgress,
    isExtracting,
  };
}
