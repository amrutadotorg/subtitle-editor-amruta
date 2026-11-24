"use client";

import type {
  InvalidTimingEntry,
  OverlapCueRef,
  OverlapPair,
} from "@/lib/overlap-report";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface OverlapPairListProps {
  /** Track the rows belong to; also passed back through `onNavigate`. */
  trackId: string;
  trackName: string;
  pairs: OverlapPair[];
  invalidTiming?: InvalidTimingEntry[];
  /**
   * When provided, cue numbers become buttons that jump to the cue. When
   * omitted the rows are plain text (the save confirmation downloads instead
   * of navigating).
   */
  onNavigate?: (trackId: string, uuid: string) => void;
  className?: string;
}

const formatOverlapSeconds = (overlapMs: number): string =>
  (overlapMs / 1000).toFixed(3);

/**
 * The pair/invalid-timing list shared by the post-import report and the save
 * confirmation. Callers cap the rows (see `limitOverlapPairs`) and pass only
 * the track's own entries.
 */
export default function OverlapPairList({
  trackId,
  trackName,
  pairs,
  invalidTiming = [],
  onNavigate,
  className,
}: OverlapPairListProps) {
  const t = useTranslations();

  const renderCueRef = (cue: OverlapCueRef) =>
    onNavigate ? (
      <button
        type="button"
        onClick={() => onNavigate(trackId, cue.uuid)}
        aria-label={t("overlaps.goToCue", { id: cue.id, track: trackName })}
        className="cursor-pointer rounded-xs px-1 text-sm font-semibold font-mono text-[var(--ruby-9)] underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t("overlaps.cueButton", { id: cue.id })}
      </button>
    ) : (
      <span className="px-1 text-sm font-semibold font-mono">
        {t("overlaps.cueButton", { id: cue.id })}
      </span>
    );

  return (
    <div className={cn("space-y-2", className)}>
      {pairs.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">
            {t("overlaps.pairsSection")}
          </h4>
          <ul className="space-y-1">
            {pairs.map((pair) => (
              <li
                key={`${pair.a.uuid}:${pair.b.uuid}`}
                data-overlap-pair=""
                className="grid gap-1 rounded border border-border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {renderCueRef(pair.a)}
                  <span className="font-mono text-xs tabular-nums">
                    {t("overlaps.cueRange", {
                      start: pair.a.start,
                      end: pair.a.end,
                    })}
                  </span>
                  {renderCueRef(pair.b)}
                  <span className="font-mono text-xs tabular-nums">
                    {t("overlaps.cueRange", {
                      start: pair.b.start,
                      end: pair.b.end,
                    })}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t("overlaps.overlapDuration", {
                    value: formatOverlapSeconds(pair.overlapMs),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {invalidTiming.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold">
            {t("overlaps.invalidSection")}
          </h4>
          <ul className="space-y-1">
            {invalidTiming.map((entry) => (
              <li
                key={entry.cue.uuid}
                className="grid gap-1 rounded border border-border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {renderCueRef(entry.cue)}
                  <span className="font-mono text-xs tabular-nums">
                    {t("overlaps.cueRange", {
                      start: entry.cue.start,
                      end: entry.cue.end,
                    })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("overlaps.invalidCue")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
