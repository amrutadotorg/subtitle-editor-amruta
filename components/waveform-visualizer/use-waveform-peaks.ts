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
      return;
    }

    const large = mediaFile.size > 100 * 1024 * 1024;
    setIsLargeFile(large);

    const isMp4 = mediaFile.name.toLowerCase().match(/\.(mp4|m4a|mov)$/);

    if (large && isMp4) {
      const runExtraction = (skipCache = false) => {
        if (!skipCache && peaksCacheKey) {
          getCachedPeaks(peaksCacheKey).then((cached) => {
            if (cached) {
              setExtractedPeaks(cached.peaks);
              setExtractedDuration(cached.duration);
              const objectUrl = URL.createObjectURL(mediaFile);
              setMediaUrl(objectUrl);
              setIsLoading(true);
            } else {
              runExtraction(true);
            }
          });
          return;
        }

        setIsExtracting(true);
        setExtractionProgress(0);

        extractPeaks(mediaFile, (percent: number) => {
          setExtractionProgress(percent);
        })
          .then(({ peaks, duration }) => {
            setExtractedPeaks([peaks]);
            setExtractedDuration(duration);
            setIsExtracting(false);
            if (peaksCacheKey) {
              setCachedPeaks(peaksCacheKey, peaks, duration);
            }
            const objectUrl = URL.createObjectURL(mediaFile);
            setMediaUrl(objectUrl);
          })
          .catch((e: unknown) => {
            warnDev("Peak extraction failed, falling back to dummy peaks:", e);
            setExtractedPeaks([new Float32Array([0])]);
            setExtractedDuration(undefined);
            setIsExtracting(false);
            const objectUrl = URL.createObjectURL(mediaFile);
            setMediaUrl(objectUrl);
          });
      };

      runExtraction();
    } else if (large) {
      setExtractedPeaks([new Float32Array([0])]);
      setExtractedDuration(undefined);
      const objectUrl = URL.createObjectURL(mediaFile);
      setMediaUrl(objectUrl);
    } else {
      setExtractedPeaks(undefined);
      setExtractedDuration(undefined);
      const objectUrl = URL.createObjectURL(mediaFile);
      setMediaUrl(objectUrl);
    }

    setIsLoading(true);

    return () => {
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
