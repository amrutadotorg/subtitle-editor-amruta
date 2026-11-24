import SubtitleList, {
  type SubtitleListRef,
} from "@/components/subtitle/subtitle-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOverlapReport } from "@/hooks/use-overlap-report";
import { buildOverlapPartnerMap } from "@/lib/overlap-report";
import { getTrackColor, getTrackHandleColor } from "@/lib/track-colors";
import type { SubtitleTrack } from "@/types/subtitle";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  useMemo,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

interface TrackTabsProps {
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  setActiveTrackId: (id: string) => void;
  subtitleListRef: RefObject<SubtitleListRef | null>;
  playbackTime: number;
  isPlaying: boolean;
  resumePlayback: () => void;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setPlaybackTime: (time: number) => void;
  editingSubtitleUuid: string | null;
  setEditingSubtitleUuid: Dispatch<SetStateAction<string | null>>;
  onScrollToRegion: (uuid: string) => void;
  onTimeJump: (seconds: number) => void;
  jumpDuration: number;
  resumeUuid: string | null;
  onLoadSubtitleFile: (file: File) => Promise<void>;
  onStartFromScratch: () => void;
}

export default function TrackTabs({
  tracks,
  activeTrackId,
  setActiveTrackId,
  subtitleListRef,
  playbackTime,
  isPlaying,
  resumePlayback,
  setIsPlaying,
  setPlaybackTime,
  editingSubtitleUuid,
  setEditingSubtitleUuid,
  onScrollToRegion,
  onTimeJump,
  jumpDuration,
  resumeUuid,
  onLoadSubtitleFile,
  onStartFromScratch,
}: TrackTabsProps) {
  const t = useTranslations();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme ?? "light";
  const overlapReport = useOverlapReport();
  const overlapPartnersByUuid = useMemo(
    () => buildOverlapPartnerMap(overlapReport),
    [overlapReport],
  );

  if (tracks.length === 0 || !activeTrackId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground rounded-sm">
        <Label className="cursor-pointer text-xl hover:text-accent-ink underline">
          <span>{t("labels.loadSrtFile")}</span>
          <Input
            type="file"
            className="hidden"
            accept=".srt,.vtt"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              await onLoadSubtitleFile(file);
            }}
          />
        </Label>
        <p className="text-xl my-4">{t("labels.or")}</p>
        <Button
          variant="link"
          onClick={onStartFromScratch}
          className="cursor-pointer text-xl text-muted-foreground underline hover:text-accent-ink"
        >
          {t("labels.startFromScratch")}
        </Button>
      </div>
    );
  }

  return (
    <Tabs
      value={activeTrackId}
      onValueChange={setActiveTrackId}
      className="h-full flex flex-col"
    >
      {tracks.length > 1 && (
        <TabsList className="py-1 flex-nowrap overflow-x-auto overflow-y-hidden border-dashed border-b border-black dark:border-white gap-2">
          {tracks.map((track, trackIndex) => {
            const handleColor = getTrackHandleColor(trackIndex);
            const inactiveAlpha = theme === "dark" ? 0.5 : 0.25;
            const isActive = track.id === activeTrackId;
            const overlapCount =
              overlapReport.countsByTrack[track.id]?.overlaps ?? 0;
            const backgroundColor = isActive
              ? handleColor
              : getTrackColor(trackIndex, inactiveAlpha);
            // Active = black on the solid track fill. Inactive sits on a
            // translucent track tint: dark text works on the light (light-mode)
            // tint, but the dark-mode tint needs white text (was #111827 → ~2.4:1).
            const color = isActive
              ? "#000000"
              : theme === "dark"
                ? "#ffffff"
                : "#111827";
            const borderColor = isActive
              ? theme === "dark"
                ? "#ffffff"
                : "#000000"
              : "transparent";
            return (
              <TabsTrigger
                key={track.id}
                value={track.id}
                className="shadow-none shrink-0 rounded-xs border-2 px-2 py-1 text-sm font-semibold transition-opacity focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-hidden dark:focus-visible:ring-white"
                style={{
                  backgroundColor,
                  color,
                  borderColor,
                }}
              >
                {track.name}
                {overlapCount > 0 ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="ms-1 inline-flex min-w-4 items-center justify-center rounded-sm bg-black/10 px-1 text-[10px] font-bold tabular-nums dark:bg-white/20"
                    >
                      {overlapCount}
                    </span>
                    <span className="sr-only">
                      {t("overlaps.trackBadge", { count: overlapCount })}
                    </span>
                  </>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      )}
      {tracks.map((track) => (
        <TabsContent
          key={track.id}
          value={track.id}
          className="grow overflow-y-auto m-0 min-h-0"
        >
          <SubtitleList
            ref={activeTrackId === track.id ? subtitleListRef : undefined}
            currentTime={playbackTime}
            isPlaying={isPlaying}
            onScrollToRegion={onScrollToRegion}
            resumePlayback={resumePlayback}
            setIsPlaying={setIsPlaying}
            setPlaybackTime={setPlaybackTime}
            editingSubtitleUuid={editingSubtitleUuid}
            setEditingSubtitleUuid={setEditingSubtitleUuid}
            onTimeJump={onTimeJump}
            jumpDuration={jumpDuration}
            resumeUuid={activeTrackId === track.id ? resumeUuid : null}
            overlapPartnersByUuid={overlapPartnersByUuid}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
