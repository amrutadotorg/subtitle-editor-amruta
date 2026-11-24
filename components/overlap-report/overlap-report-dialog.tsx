"use client";

import { useTranslations } from "next-intl";

import OverlapPairList from "@/components/overlap-report/overlap-pair-list";
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
  selectTrackOverlapRows,
  type OverlapReport,
} from "@/lib/overlap-report";
import { cn } from "@/lib/utils";
import type { SubtitleTrack } from "@/types/subtitle";

interface OverlapReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: OverlapReport | null;
  /** Workspace tracks, used for section order and headings. */
  tracks: SubtitleTrack[];
  onNavigate: (trackId: string, uuid: string) => void;
  className?: string;
}

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

  const tracksWithIssues = tracks.filter((track) => {
    const counts = report.countsByTrack[track.id];
    return counts ? counts.overlaps > 0 || counts.invalid > 0 : false;
  });

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
            const {
              pairs: trackPairs,
              invalidTiming: trackInvalid,
              hiddenPairCount,
            } = selectTrackOverlapRows(report, track.id);

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

                <OverlapPairList
                  trackId={track.id}
                  trackName={track.name}
                  pairs={trackPairs}
                  invalidTiming={trackInvalid}
                  headingLevel="h4"
                  onNavigate={handleNavigate}
                />
                {hiddenPairCount > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("overlaps.morePairs", { count: hiddenPairCount })}
                  </p>
                )}
              </section>
            );
          })}
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
