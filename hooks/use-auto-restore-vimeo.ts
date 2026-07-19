import { useEffect, useRef } from "react";
import { getCachedFile } from "@/lib/vimeo-file-cache";
import type { LocalSessionSnapshot } from "@/lib/local-session";

export function useAutoRestoreVimeo({
  pendingLocalSession,
  vimeoVideoId,
  mediaFile,
  loadMediaFile,
  skipAutoRestoreRef,
}: {
  pendingLocalSession: LocalSessionSnapshot | null;
  vimeoVideoId: string | null;
  mediaFile: File | null;
  loadMediaFile: (file: File) => void;
  skipAutoRestoreRef: React.MutableRefObject<boolean>;
}) {
  const prevPendingSession = useRef(pendingLocalSession);

  useEffect(() => {
    const hadPending = prevPendingSession.current !== null;
    prevPendingSession.current = pendingLocalSession;
    if (
      hadPending &&
      pendingLocalSession === null &&
      vimeoVideoId &&
      !mediaFile
    ) {
      if (!skipAutoRestoreRef.current) {
        getCachedFile(vimeoVideoId).then((file) => {
          if (file) loadMediaFile(file);
        });
      }
      skipAutoRestoreRef.current = false;
    }
  }, [
    pendingLocalSession,
    vimeoVideoId,
    mediaFile,
    loadMediaFile,
    skipAutoRestoreRef,
  ]);
}
