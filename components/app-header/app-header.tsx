"use client";

import FindReplace from "@/components/find-replace";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLocalSession, useSubtitleState } from "@/context/subtitle-context";
import { getTrackHandleColor } from "@/lib/track-colors";
import type { SubtitleTrack } from "@/types/subtitle";
import {
  IconAdjustmentsHorizontal,
  IconArrowBack,
  IconArrowForward,
  IconBrandVimeo,
  IconBulb,
  IconMovie,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { type RefObject, useState } from "react";
import LanguageSwitcher from "./language-switcher";
import LoadSrt from "./load-srt";
import SaveSrt from "./save-srt";
import SettingsTrigger from "./settings-trigger";
import StatisticsTrigger from "./statistics-trigger";
import VimeoLoader from "@/components/vimeo-loader";

import { version } from "../../package.json";

function getBulkButtonColors(
  tracks: SubtitleTrack[],
  activeTrackId: string | null,
) {
  const index = tracks.findIndex((track) => track.id === activeTrackId);
  if (index < 0) {
    return {
      bulkColor: "#334155",
      bulkTextColor: "#ffffff",
    };
  }
  const base = getTrackHandleColor(index);
  return {
    bulkColor: base,
    bulkTextColor: "#000000",
  };
}

interface AppHeaderProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  mediaFileInputRef: RefObject<HTMLInputElement | null>;
  onSelectMediaFile: (file: File) => void;
  mediaFileName: string;
  isBulkOffsetOpen: boolean;
  onToggleBulkOffset: () => void;
  bulkOffsetDisabled: boolean;
  isVimeoOpen: boolean;
  onSetVimeoOpen: (open: boolean) => void;
  vimeoInitialUrl?: string;
}

export function AppHeader({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  mediaFileInputRef,
  onSelectMediaFile,
  mediaFileName,
  isBulkOffsetOpen,
  onToggleBulkOffset,
  bulkOffsetDisabled,
  isVimeoOpen,
  onSetVimeoOpen,
  vimeoInitialUrl,
}: AppHeaderProps) {
  const t = useTranslations();
  const { tracks, activeTrackId } = useSubtitleState();
  const { setVimeoVideoId } = useLocalSession();
  const { bulkColor, bulkTextColor } = getBulkButtonColors(
    tracks,
    activeTrackId ?? null,
  );
  const bulkButtonStyle = isBulkOffsetOpen
    ? {
        backgroundColor: bulkColor,
        color: bulkTextColor,
      }
    : undefined;

  return (
    <nav className="min-h-[6vh] border-b-2 border-black dark:border-white flex flex-wrap items-center gap-2 px-3 py-2 sm:px-6 lg:px-12 justify-between">
      <div className="flex items-center gap-1">
        <h1 className="text-lg font-semibold mx-1 sm:mx-4 inline-flex items-center gap-2">
          <Logo className="h-[1.25em] w-[1.25em] shrink-0" />
          {t("navigation.title")}
          <span className="text-[10px] font-mono opacity-40 self-end mb-0.5">
            v{version}
          </span>
        </h1>
        <LanguageSwitcher />
      </div>

      <div className="flex flex-wrap justify-end gap-2 sm:gap-4 items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canUndo}
                onClick={onUndo}
                className="cursor-pointer"
                aria-label={t("navigation.undo")}
              >
                <IconArrowBack />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("navigation.undo")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canRedo}
                onClick={onRedo}
                className="cursor-pointer"
                aria-label={t("navigation.redo")}
              >
                <IconArrowForward />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("navigation.redo")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <SettingsTrigger />
        <StatisticsTrigger />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                asChild
              >
                <Link href="/best-practices" aria-label="Best Practices">
                  <IconBulb />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Best Practices</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="default"
                variant="outline"
                onClick={onToggleBulkOffset}
                disabled={bulkOffsetDisabled}
                className="flex items-center rounded-xs shadow-none border-black dark:border-white"
                style={bulkButtonStyle}
                aria-pressed={isBulkOffsetOpen}
              >
                <IconAdjustmentsHorizontal />
                <span className="hidden sm:inline">
                  {t("navigation.bulkOffset")}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent
              style={{
                backgroundColor: bulkColor,
                borderColor: bulkColor,
                color: bulkTextColor,
              }}
            >
              {isBulkOffsetOpen
                ? t("navigation.hideBulkOffset")
                : t("navigation.showBulkOffset")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <FindReplace />

        <LoadSrt />

        <Label className="cursor-pointer">
          <Input
            ref={mediaFileInputRef}
            type="file"
            className="hidden"
            accept="audio/*,video/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              onSelectMediaFile(file);
            }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              mediaFileInputRef.current?.click();
            }}
            className="text-white bg-iris-800 hover:bg-iris-900 dark:hover:bg-iris-700 rounded-xs border-2 border-black dark:border-white cursor-pointer"
            aria-label={mediaFileName}
          >
            <IconMovie size={20} />
            <span className="hidden max-w-36 flex-1 overflow-hidden whitespace-nowrap text-ellipsis text-start sm:block">
              {mediaFileName}
            </span>
          </Button>
        </Label>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                className="text-white bg-iris-800 hover:bg-iris-900 dark:hover:bg-iris-700 rounded-xs border-2 border-black dark:border-white cursor-pointer"
                aria-label={t("vimeoLoader.buttonLabel")}
                onClick={() => onSetVimeoOpen(true)}
              >
                <IconBrandVimeo size={20} />
                <span className="hidden leading-none truncate sm:inline">
                  {t("vimeoLoader.buttonLabel")}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("vimeoLoader.buttonLabel")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <SaveSrt />
      </div>

      <VimeoLoader
        open={isVimeoOpen}
        onOpenChange={onSetVimeoOpen}
        onFileLoaded={onSelectMediaFile}
        onVideoId={setVimeoVideoId}
        initialUrl={vimeoInitialUrl}
      />
    </nav>
  );
}
