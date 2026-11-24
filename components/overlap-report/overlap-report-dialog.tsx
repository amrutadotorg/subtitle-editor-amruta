"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  OVERLAP_PAIR_DISPLAY_LIMIT,
  type OverlapCueRef,
  type OverlapReport,
} from "@/lib/overlap-report";
import { cn } from "@/lib/utils";
import type { SubtitleTrack } from "@/types/subtitle";
import { useTranslations } from "next-intl";

interface OverlapReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: OverlapReport | null;
  /** Workspace tracks, used for section order and headings. */
  tracks: SubtitleTrack[];
  onNavigate: (trackId: string, uuid: string) => void;
  className?: string;
}

const formatOverlapSeconds = (overlapMs: number): string =>
  (overlapMs / 1000).toFixed(3);

export default function OverlapReportDialog({
  open,
  onOpenChange,
  report,
  tracks,
  onNavigate,
  className,
}: OverlapReportDialogProps) {
  const t = useTranslations();

  const handleNavigate = (trackId: string, uuid: string) => {
    onNavigate(trackId, uuid);
    onOpenChange(false);
  };

  if (
    !report ||
    (report.pairs.length === 0 && report.invalidTiming.length === 0)
  ) {
    return null;
  }

  const displayedPairs = report.pairs.slice(0, OVERLAP_PAIR_DISPLAY_LIMIT);
  const hiddenPairCount = report.pairs.length - displayedPairs.length;
  const tracksWithIssues = tracks.filter((track) => {
    const counts = report.countsByTrack[track.id];
    return counts ? counts.overlaps > 0 || counts.invalid > 0 : false;
  });

  const renderCueButton = (
    trackId: string,
    trackName: string,
    cue: OverlapCueRef,
  ) => (
    <button
      type="button"
      onClick={() => handleNavigate(trackId, cue.uuid)}
      aria-label={t("overlaps.goToCue", { id: cue.id, track: trackName })}
      className="cursor-pointer rounded-xs px-1 text-sm font-semibold font-mono text-[var(--ruby-9)] underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {t("overlaps.cueButton", { id: cue.id })}
    </button>
  );

  const renderPairRow = (
    track: SubtitleTrack,
    pair: OverlapReport["pairs"][number],
  ) => (
    <li
      key={`${pair.a.uuid}:${pair.b.uuid}`}
      data-overlap-pair=""
      className="grid gap-1 rounded border border-border px-3 py-2 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {renderCueButton(track.id, track.name, pair.a)}
        <span className="font-mono text-xs tabular-nums">
          {t("overlaps.cueRange", { start: pair.a.start, end: pair.a.end })}
        </span>
        {renderCueButton(track.id, track.name, pair.b)}
        <span className="font-mono text-xs tabular-nums">
          {t("overlaps.cueRange", { start: pair.b.start, end: pair.b.end })}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {t("overlaps.overlapDuration", {
          value: formatOverlapSeconds(pair.overlapMs),
        })}
      </span>
    </li>
  );

  const renderInvalidRow = (
    track: SubtitleTrack,
    entry: OverlapReport["invalidTiming"][number],
  ) => (
    <li
      key={entry.cue.uuid}
      className="grid gap-1 rounded border border-border px-3 py-2 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {renderCueButton(track.id, track.name, entry.cue)}
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
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[85vh] max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-2xl",
          className,
        )}
      >
        <DialogHeader className="shrink-0 text-start">
          <DialogTitle>{t("overlaps.reportTitle")}</DialogTitle>
          <DialogDescription>
            {t("overlaps.reportDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto pe-1">
          {tracksWithIssues.map((track) => {
            const counts = report.countsByTrack[track.id] ?? {
              overlaps: 0,
              invalid: 0,
            };
            const trackPairs = displayedPairs.filter(
              (pair) => pair.trackId === track.id,
            );
            const trackInvalid = report.invalidTiming.filter(
              (entry) => entry.trackId === track.id,
            );

            return (
              <section key={track.id} aria-label={track.name}>
                <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="text-foreground">{track.name}</span>
                  <span className="text-xs font-normal normal-case tracking-normal tabular-nums">
                    {t("overlaps.trackCounts", {
                      overlaps: counts.overlaps,
                      invalid: counts.invalid,
                    })}
                  </span>
                </h3>

                {trackPairs.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold">
                      {t("overlaps.pairsSection")}
                    </h4>
                    <ul className="space-y-1">
                      {trackPairs.map((pair) => renderPairRow(track, pair))}
                    </ul>
                  </div>
                )}

                {trackInvalid.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <h4 className="text-xs font-semibold">
                      {t("overlaps.invalidSection")}
                    </h4>
                    <ul className="space-y-1">
                      {trackInvalid.map((entry) =>
                        renderInvalidRow(track, entry),
                      )}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}

          {hiddenPairCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("overlaps.morePairs", { count: hiddenPairCount })}
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0">
          <DialogClose asChild>
            <Button variant="outline" className="cursor-pointer">
              {t("overlaps.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
