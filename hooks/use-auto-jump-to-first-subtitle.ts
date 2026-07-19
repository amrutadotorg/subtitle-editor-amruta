import { useEffect } from "react";
import { timeToSeconds } from "@/lib/utils";
import type { Subtitle } from "@/types/subtitle";

export function useAutoJumpToFirstSubtitle({
  subtitles,
  shouldJumpToFirstRef,
  pendingSeekRef,
  requestScroll,
}: {
  subtitles: Subtitle[];
  shouldJumpToFirstRef: React.MutableRefObject<boolean>;
  pendingSeekRef: React.MutableRefObject<number | null>;
  requestScroll: (uuid: string, options?: { instant?: boolean }) => void;
}) {
  useEffect(() => {
    if (!shouldJumpToFirstRef.current || subtitles.length === 0) return;
    shouldJumpToFirstRef.current = false;
    const first = subtitles[0];
    pendingSeekRef.current = timeToSeconds(first.startTime);
    requestScroll(first.uuid, { instant: true });
  }, [subtitles, requestScroll, shouldJumpToFirstRef, pendingSeekRef]);
}
