"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSubtitles, useSubtitleState } from "@/context/subtitle-context";
import { useSubtitleNavigation } from "@/context/subtitle-navigation-context";
import {
  computeTrackMetrics,
  generateTextReport,
} from "@/lib/subtitle-metrics";
import { IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

interface StatisticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function StatisticsDialog({
  open,
  onOpenChange,
}: StatisticsDialogProps) {
  const t = useTranslations();
  const subtitles = useSubtitles();
  const { navigateToSubtitle } = useSubtitleNavigation();
  const {
    activeTrack,
    rulesMaxCps,
    rulesMaxLineLength,
    rulesMinDurationMs,
    rulesMaxDurationMs,
  } = useSubtitleState();

  const metrics = useMemo(() => {
    if (!open || subtitles.length === 0) return null;
    return computeTrackMetrics(subtitles, {
      maxCps: rulesMaxCps,
      maxWpm: 180,
      maxLineLength: rulesMaxLineLength,
      maxLines: 2,
      minDurationSeconds: rulesMinDurationMs / 1000,
      maxDurationSeconds: rulesMaxDurationMs / 1000,
    });
  }, [
    open,
    subtitles,
    rulesMaxCps,
    rulesMaxLineLength,
    rulesMinDurationMs,
    rulesMaxDurationMs,
  ]);

  const handleDownload = () => {
    if (!metrics) return;
    const trackName = activeTrack?.name ?? "Track";
    const report = generateTextReport(trackName, metrics);
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stats-${trackName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fmtSeconds = (s: number) =>
    t("statistics.seconds", { value: s.toFixed(1) });
  const fmtNum = (n: number, dec = 1) => n.toFixed(dec);

  const worstOffenders = useMemo(() => {
    if (!metrics) return [];
    return [...metrics.perCue]
      .filter((c) => c.warnings.length > 0)
      .sort((a, b) => b.cps - a.cps)
      .slice(0, 10);
  }, [metrics]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("statistics.title")}</DialogTitle>
          <DialogDescription>{activeTrack?.name ?? "—"}</DialogDescription>
        </DialogHeader>

        {!metrics ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            {t("statistics.noData")}
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-6 pr-1">
            {/* Worst Offenders */}
            {worstOffenders.length > 0 && (
              <section aria-label={t("statistics.worstOffenders")}>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  {t("statistics.worstOffenders")}
                </h3>
                <div className="overflow-x-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                          {t("statistics.colId")}
                        </th>
                        <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                          {t("statistics.colDuration")}
                        </th>
                        <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                          {t("statistics.colCps")}
                        </th>
                        <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                          {t("statistics.colWpm")}
                        </th>
                        <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">
                          {t("statistics.colLines")}
                        </th>
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                          {t("statistics.colWarnings")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {worstOffenders.map((cue) => (
                        <tr
                          key={cue.uuid}
                          className="border-t border-border hover:bg-muted/30 cursor-pointer"
                          onClick={() => {
                            navigateToSubtitle(cue.uuid);
                            onOpenChange(false);
                          }}
                        >
                          <td className="px-2 py-1.5 font-mono">{cue.id}</td>
                          <td className="px-2 py-1.5 font-mono text-right tabular-nums">
                            {fmtSeconds(cue.durationSeconds)}
                          </td>
                          <td
                            className={`px-2 py-1.5 font-mono text-right tabular-nums ${
                              cue.warnings.some((w) => w.kind === "cps_high")
                                ? "text-amber-700 dark:text-amber-400 font-semibold"
                                : ""
                            }`}
                          >
                            {fmtNum(cue.cps)}
                          </td>
                          <td
                            className={`px-2 py-1.5 font-mono text-right tabular-nums ${
                              cue.warnings.some((w) => w.kind === "wpm_high")
                                ? "text-amber-700 dark:text-amber-400 font-semibold"
                                : ""
                            }`}
                          >
                            {fmtNum(cue.wpm)}
                          </td>
                          <td
                            className={`px-2 py-1.5 font-mono text-right tabular-nums ${
                              cue.warnings.some(
                                (w) => w.kind === "too_many_lines",
                              )
                                ? "text-amber-700 dark:text-amber-400 font-semibold"
                                : ""
                            }`}
                          >
                            {cue.lineCount}
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="inline-flex flex-wrap gap-1">
                              {cue.warnings.map((w) => (
                                <span
                                  key={w.kind}
                                  className="rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 px-1 py-0.5 text-[10px] font-medium"
                                >
                                  {w.kind.replace(/_/g, " ")}
                                </span>
                              ))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Repeated Lines */}
            {metrics.mostRepeatedLines.length > 0 && (
              <section aria-label={t("statistics.repeatedLines")}>
                <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                  {t("statistics.repeatedLines")}
                </h3>
                <ul className="space-y-1">
                  {metrics.mostRepeatedLines.map(({ text, count }) => (
                    <li
                      key={text}
                      className="flex items-start gap-2 text-sm rounded border border-border px-3 py-1.5"
                    >
                      <span className="shrink-0 font-semibold text-muted-foreground text-xs mt-0.5 tabular-nums">
                        {t("statistics.repeatedCount", { count })}
                      </span>
                      <span className="font-mono text-xs break-all">
                        {text}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* Download Button */}
        {metrics && (
          <div className="shrink-0 pt-4 border-t border-border flex justify-end">
            <Button
              id="statistics-download-report"
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-2"
            >
              <IconDownload size={16} />
              {t("statistics.downloadReport")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
