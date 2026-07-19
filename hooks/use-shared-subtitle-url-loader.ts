import { useEffect, useRef } from "react";
import { warnDev, errorDev } from "@/lib/log";

export function useSharedSubtitleUrlLoader({
  loadSubtitleFile,
  shouldJumpToFirstRef,
}: {
  loadSubtitleFile: (file: File) => void;
  shouldJumpToFirstRef: React.MutableRefObject<boolean>;
}) {
  const hasImportedRef = useRef(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const sharedFile = searchParams.get("import");
    const captionFile = searchParams.get("caption");
    if ((sharedFile || captionFile) && !hasImportedRef.current) {
      hasImportedRef.current = true;

      // Clear previous auto-saved session to prevent recovery dialog from overlapping newly loaded file
      try {
        localStorage.removeItem("subtitle-editor:autosave:v1");
      } catch (err) {
        warnDev("Failed to clear local session storage:", err);
      }

      fetch(
        captionFile
          ? `/api/load-captions?file=${encodeURIComponent(captionFile)}`
          : `/api/load-shared?file=${encodeURIComponent(sharedFile!)}`,
      )
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load shared subtitles file");
          return res.text();
        })
        .then((text) => {
          const ytid = searchParams.get("ytid");
          const lang = searchParams.get("lang");
          let fileName = captionFile ?? sharedFile ?? "";
          if (ytid) {
            fileName = lang ? `${ytid}.${lang}.vtt` : `${ytid}.vtt`;
          }
          const file = new File([text], fileName, { type: "text/vtt" });
          shouldJumpToFirstRef.current = true;
          loadSubtitleFile(file);

          // Clean up URL query parameters to avoid duplicate imports on re-renders
          const url = new URL(window.location.href);
          url.searchParams.delete("import");
          url.searchParams.delete("vimeo_id");
          url.searchParams.delete("caption");
          window.history.replaceState({}, "", url.toString());
        })
        .catch((err) => {
          errorDev("Error loading shared subtitle file:", err);
          hasImportedRef.current = false;
        });
    }
  }, [loadSubtitleFile, shouldJumpToFirstRef]);
}
