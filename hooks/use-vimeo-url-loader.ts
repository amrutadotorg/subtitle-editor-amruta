import { useEffect } from "react";
import { getCachedFile, setCachedFile } from "@/lib/vimeo-file-cache";
import { errorDev } from "@/lib/log";
import type { VimeoLoadingState } from "@/components/video-player";

export function useVimeoUrlLoader({
  setVimeoVideoId,
  vimeoAbortControllerRef,
  setVimeoAutoLoad,
  loadMediaFile,
}: {
  setVimeoVideoId: (id: string | null) => void;
  vimeoAbortControllerRef: React.MutableRefObject<AbortController | null>;
  setVimeoAutoLoad: (state: VimeoLoadingState | null) => void;
  loadMediaFile: (file: File) => void;
}) {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const vimeoId = searchParams.get("vimeo_id");
    if (!vimeoId) return;

    setVimeoVideoId(vimeoId);

    // Clean up vimeo_id from URL to avoid re-triggering on re-renders
    const url = new URL(window.location.href);
    url.searchParams.delete("vimeo_id");
    window.history.replaceState({}, "", url.toString());

    const controller = new AbortController();
    vimeoAbortControllerRef.current = controller;

    getCachedFile(vimeoId).then((cachedFile) => {
      if (cachedFile) {
        loadMediaFile(cachedFile);
      } else {
        // Not cached — show loading overlay and download from Vimeo API
        setVimeoAutoLoad({ status: "downloading", progress: null });
        fetch(
          `/api/vimeo/download?url=${encodeURIComponent(`https://vimeo.com/${vimeoId}`)}`,
          { signal: controller.signal },
        )
          .then((res) => {
            if (!res.ok)
              throw new Error(`Vimeo download failed (${res.status})`);

            const contentLength = res.headers.get("content-length");
            const total = contentLength ? parseInt(contentLength, 10) : null;

            // Decode URL-encoded filename from Content-Disposition header
            const disposition = res.headers.get("content-disposition");
            const rawFilename =
              disposition?.match(/filename="(.+?)"/)?.[1] ??
              `vimeo-${vimeoId}.mp4`;
            const filename = decodeURIComponent(rawFilename);

            setVimeoAutoLoad({
              status: "downloading",
              progress: total ? 0 : null,
              filename,
            });

            const reader = res.body!.getReader();
            const chunks: Uint8Array[] = [];
            let received = 0;

            const pump = (): Promise<void> =>
              reader.read().then(({ done, value }) => {
                if (done) return;
                chunks.push(value);
                received += value.length;
                if (total) {
                  setVimeoAutoLoad({
                    status: "downloading",
                    progress: Math.round((received / total) * 100),
                    filename,
                  });
                }
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
              const contentType =
                res.headers.get("content-type") ?? "video/mp4";
              const blob = new Blob([merged], { type: contentType });
              const file = new File([blob], filename, {
                type: contentType,
              });
              setCachedFile(vimeoId, file);
              setVimeoAutoLoad(null);
              loadMediaFile(file);
            });
          })
          .catch((err) => {
            if ((err as Error).name === "AbortError") {
              // User cancelled — clear overlay silently
              setVimeoAutoLoad(null);
              return;
            }
            errorDev("Vimeo auto-load failed:", err);
            setVimeoAutoLoad({ status: "error", progress: null });
          });
      }
    });

    return () => {
      controller.abort();
      vimeoAbortControllerRef.current = null;
    };
  }, [
    loadMediaFile,
    setVimeoVideoId,
    setVimeoAutoLoad,
    vimeoAbortControllerRef,
  ]);
}
