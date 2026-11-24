"use client";

import OverlapPairList from "@/components/overlap-report/overlap-pair-list";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSubtitleState } from "@/context/subtitle";
import { useOverlapReport } from "@/hooks/use-overlap-report";
import { buildTrackFile, type TrackFile } from "@/lib/format";
import {
  needsOverlapConfirmation,
  selectTrackOverlapRows,
  type OverlapDownloadFormat,
} from "@/lib/overlap-report";
import { getTrackHandleColor } from "@/lib/track-colors";
import type { SubtitleTrack } from "@/types/subtitle";
import { IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface SaveSrtProps {
  /**
   * Receives the generated file instead of downloading it in the browser.
   * Defaults to the real download; tests inject this because JSDOM has no
   * `URL.createObjectURL`.
   */
  onDownload?: (file: TrackFile) => void;
}

interface PendingDownload {
  trackId: string;
  format: OverlapDownloadFormat;
}

const downloadInBrowser = ({ fileName, content, mime }: TrackFile) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export default function SaveSrt({
  onDownload = downloadInBrowser,
}: SaveSrtProps) {
  const t = useTranslations();
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [pendingDownload, setPendingDownload] =
    useState<PendingDownload | null>(null);
  const { tracks } = useSubtitleState();
  const overlapReport = useOverlapReport();

  const downloadTrackById = (
    trackId: string,
    format: OverlapDownloadFormat,
  ) => {
    const track = tracks.find((candidate) => candidate.id === trackId);
    if (!track || track.subtitles.length === 0) return;
    onDownload(buildTrackFile(track, format));
    setPendingDownload(null);
    setIsSaveDialogOpen(false);
  };

  const requestDownload = (
    track: SubtitleTrack,
    format: OverlapDownloadFormat,
  ) => {
    if (
      needsOverlapConfirmation(format, overlapReport.countsByTrack[track.id])
    ) {
      setPendingDownload({ trackId: track.id, format });
      return;
    }
    downloadTrackById(track.id, format);
  };

  const openDialog = () => setIsSaveDialogOpen(true);
  const handleSaveDialogOpenChange = (open: boolean) => {
    setIsSaveDialogOpen(open);
    if (!open) setPendingDownload(null);
  };
  const isDisabled =
    tracks.length === 0 || !tracks.some((track) => track.subtitles.length > 0);

  // .srt leads (solid teal, like the Save button); the rest are teal-tint
  // alternates. Teal is our single "export / get data out" color.
  const formats = [
    {
      format: "srt" as const,
      label: t("buttons.downloadAsSrt"),
      primary: true,
    },
    {
      format: "vtt" as const,
      label: t("buttons.downloadAsVtt"),
      primary: false,
    },
    {
      format: "txt" as const,
      label: t("buttons.downloadAsTxt"),
      primary: false,
    },
    {
      format: "csv" as const,
      label: t("buttons.downloadAsCsv"),
      primary: false,
    },
  ];

  const pendingTrack = pendingDownload
    ? tracks.find((track) => track.id === pendingDownload.trackId)
    : undefined;
  const pendingRows = pendingTrack
    ? selectTrackOverlapRows(overlapReport, pendingTrack.id)
    : { pairs: [], invalidTiming: [], hiddenPairCount: 0 };
  const pendingOverlapCount = pendingTrack
    ? (overlapReport.countsByTrack[pendingTrack.id]?.overlaps ?? 0)
    : 0;

  return (
    <>
      <Dialog open={isSaveDialogOpen} onOpenChange={handleSaveDialogOpenChange}>
        <DialogTrigger asChild>
          <Button
            onClick={openDialog}
            disabled={isDisabled}
            className="cursor-pointer text-black bg-teal-800 hover:bg-teal-900 rounded-xs border-2 border-black dark:border-white"
            aria-label={t("buttons.saveSrt")}
          >
            <IconDownload size={20} />
            <span className="hidden sm:inline">{t("buttons.saveSrt")}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-160">
          <DialogHeader>
            <DialogTitle>{t("dialog.saveTitle")}</DialogTitle>
            <DialogDescription>{t("dialog.saveDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {tracks.map((track, index) => {
              const barColor = getTrackHandleColor(index);
              const isEmpty = track.subtitles.length === 0;
              const overlapCount =
                overlapReport.countsByTrack[track.id]?.overlaps ?? 0;
              return (
                <div
                  key={track.id}
                  data-save-track={track.id}
                  className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center pl-4"
                  style={{ boxShadow: `inset 4px 0 0 ${barColor}` }}
                >
                  <div className="min-w-0">
                    <span
                      className="block truncate font-medium"
                      title={track.name}
                    >
                      {track.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                      <span>
                        {t("subtitle.subtitleCount", {
                          count: track.subtitles.length,
                        })}
                      </span>
                      {overlapCount > 0 ? (
                        <>
                          <span
                            data-overlap-badge=""
                            title={t("overlaps.saveBadge", {
                              count: overlapCount,
                            })}
                            aria-hidden="true"
                            className="inline-flex min-w-4 items-center justify-center rounded-sm bg-black/10 px-1 text-xs font-bold tabular-nums text-[var(--ruby-9)] dark:bg-white/20"
                          >
                            {overlapCount}
                          </span>
                          <span className="sr-only">
                            {t("overlaps.saveBadge", {
                              count: overlapCount,
                            })}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {formats.map(({ format, label, primary }) => (
                      <Button
                        key={format}
                        disabled={isEmpty}
                        onClick={() => requestDownload(track, format)}
                        className={
                          primary
                            ? "cursor-pointer text-black bg-teal-800 hover:bg-teal-900 rounded-xs border-2 border-black dark:border-white"
                            : "cursor-pointer text-[color:var(--teal-12)] bg-teal-200 hover:bg-teal-300 rounded-xs border-2 border-black dark:border-white"
                        }
                      >
                        <IconDownload size={18} />
                        <span className="ml-1">{label}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {pendingDownload && pendingTrack ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingDownload(null);
          }}
        >
          <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl">
            <AlertDialogHeader className="text-start">
              <AlertDialogTitle>
                {t("overlaps.saveConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("overlaps.saveConfirmDescription", {
                  track: pendingTrack.name,
                  count: pendingOverlapCount,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="max-h-[50vh] overflow-y-auto pe-1">
              <OverlapPairList
                trackId={pendingTrack.id}
                trackName={pendingTrack.name}
                pairs={pendingRows.pairs}
                invalidTiming={pendingRows.invalidTiming}
              />
              {pendingRows.hiddenPairCount > 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("overlaps.morePairs", {
                    count: pendingRows.hiddenPairCount,
                  })}
                </p>
              ) : null}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="cursor-pointer">
                {t("overlaps.back")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  downloadTrackById(
                    pendingDownload.trackId,
                    pendingDownload.format,
                  )
                }
                className="cursor-pointer"
              >
                {t("overlaps.downloadAnyway")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
