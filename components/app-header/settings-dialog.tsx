"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLocalSession, useSubtitleState } from "@/context/subtitle-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { IconMoon, IconSun, IconTrash } from "@tabler/icons-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useId, useState } from "react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsDialog({
  open,
  onOpenChange,
}: SettingsDialogProps) {
  const t = useTranslations();
  const { resolvedTheme, setTheme } = useTheme();
  const { toast } = useToast();
  const { hasLocalSession, clearLocalSession } = useLocalSession();
  const [isThemeMounted, setIsThemeMounted] = useState(false);
  const {
    clampOverlaps,
    setClampOverlaps,
    showSubtitleDuration,
    setShowSubtitleDuration,
    addSpaceOnMerge,
    setAddSpaceOnMerge,
    playInBackground,
    setPlayInBackground,
    rulesMaxLineLength,
    setRulesMaxLineLength,
    rulesMaxCps,
    setRulesMaxCps,
    rulesMinDurationMs,
    setRulesMinDurationMs,
    rulesMaxDurationMs,
    setRulesMaxDurationMs,
  } = useSubtitleState();
  const overlapClampId = useId();
  const subtitleDurationId = useId();
  const addSpaceOnMergeId = useId();
  const playInBackgroundId = useId();
  const rulesMaxLineLengthId = useId();
  const rulesMaxCpsId = useId();
  const rulesMinDurationId = useId();
  const rulesMaxDurationId = useId();

  const handleClearLocalSession = () => {
    clearLocalSession();
    toast({
      title: t("localSession.clearedTitle"),
      description: t("localSession.clearedDescription"),
    });
  };

  useEffect(() => {
    setIsThemeMounted(true);
  }, []);

  const themeValue = isThemeMounted ? (resolvedTheme ?? "") : "";
  const activeTheme = themeValue === "dark" ? "dark" : "light";
  const themeOptions = [
    {
      value: "light",
      label: t("dialog.themeLight"),
      icon: IconSun,
    },
    {
      value: "dark",
      label: t("dialog.themeDark"),
      icon: IconMoon,
    },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialog.settingsTitle")}</DialogTitle>
          <DialogDescription>
            {t("dialog.settingsDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label className="text-sm">{t("dialog.themeLabel")}</Label>
            <div
              className="relative grid grid-cols-2 rounded-md border-2 border-foreground bg-neutral-100 p-0.5 dark:bg-neutral-900"
              role="tablist"
              aria-label={t("dialog.themeLabel")}
            >
              {isThemeMounted ? (
                <motion.div
                  aria-hidden="true"
                  className="absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-xs bg-white dark:bg-neutral-950"
                  animate={{ x: activeTheme === "dark" ? "100%" : "0%" }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              ) : null}

              {themeOptions.map((option) => {
                const Icon = option.icon;
                const isActive = activeTheme === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    disabled={!isThemeMounted}
                    className={cn(
                      "relative z-10 inline-flex min-w-[6.25rem] items-center justify-center gap-1.5 rounded-xs px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setTheme(option.value)}
                  >
                    <Icon size={16} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={overlapClampId} className="text-sm">
                {t("dialog.overlapClampLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("dialog.overlapClampDescription")}
              </p>
            </div>
            <Switch
              id={overlapClampId}
              checked={clampOverlaps}
              onCheckedChange={(value) => setClampOverlaps(value)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={subtitleDurationId} className="text-sm">
                {t("dialog.subtitleDurationLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("dialog.subtitleDurationDescription")}
              </p>
            </div>
            <Switch
              id={subtitleDurationId}
              checked={showSubtitleDuration}
              onCheckedChange={(value) => setShowSubtitleDuration(value)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={addSpaceOnMergeId} className="text-sm">
                {t("dialog.addSpaceOnMergeLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("dialog.addSpaceOnMergeDescription")}
              </p>
            </div>
            <Switch
              id={addSpaceOnMergeId}
              checked={addSpaceOnMerge}
              onCheckedChange={(value) => setAddSpaceOnMerge(value)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={playInBackgroundId} className="text-sm">
                {t("dialog.playInBackgroundLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("dialog.playInBackgroundDescription")}
              </p>
            </div>
            <Switch
              id={playInBackgroundId}
              checked={playInBackground}
              onCheckedChange={(value) => setPlayInBackground(value)}
            />
          </div>
          
          <div className="h-px bg-border my-2" />

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">
              {t("dialog.rulesHeader")}
            </h4>

            <div className="grid grid-cols-2 items-center gap-4">
              <Label htmlFor={rulesMaxLineLengthId} className="text-sm">
                {t("dialog.rulesMaxLineLengthLabel")}
              </Label>
              <Input
                id={rulesMaxLineLengthId}
                type="number"
                min={1}
                value={rulesMaxLineLength || ""}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value, 10);
                  setRulesMaxLineLength(Number.isNaN(val) ? 0 : val);
                }}
                className="h-8 w-24 justify-self-end text-right font-mono bg-background"
              />
            </div>

            <div className="grid grid-cols-2 items-center gap-4">
              <Label htmlFor={rulesMaxCpsId} className="text-sm">
                {t("dialog.rulesMaxCpsLabel")}
              </Label>
              <Input
                id={rulesMaxCpsId}
                type="number"
                min={1}
                value={rulesMaxCps || ""}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value, 10);
                  setRulesMaxCps(Number.isNaN(val) ? 0 : val);
                }}
                className="h-8 w-24 justify-self-end text-right font-mono bg-background"
              />
            </div>

            <div className="grid grid-cols-2 items-center gap-4">
              <Label htmlFor={rulesMinDurationId} className="text-sm">
                {t("dialog.rulesMinDurationLabel")}
              </Label>
              <Input
                id={rulesMinDurationId}
                type="number"
                min={0}
                step={100}
                value={rulesMinDurationMs || ""}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value, 10);
                  setRulesMinDurationMs(Number.isNaN(val) ? 0 : val);
                }}
                className="h-8 w-24 justify-self-end text-right font-mono bg-background"
              />
            </div>

            <div className="grid grid-cols-2 items-center gap-4">
              <Label htmlFor={rulesMaxDurationId} className="text-sm">
                {t("dialog.rulesMaxDurationLabel")}
              </Label>
              <Input
                id={rulesMaxDurationId}
                type="number"
                min={0}
                step={500}
                value={rulesMaxDurationMs || ""}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value, 10);
                  setRulesMaxDurationMs(Number.isNaN(val) ? 0 : val);
                }}
                className="h-8 w-24 justify-self-end text-right font-mono bg-background"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm">
                {t("localSession.settingsClearLabel")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("localSession.settingsClearDescription")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasLocalSession}
              onClick={handleClearLocalSession}
            >
              <IconTrash size={16} />
              {hasLocalSession
                ? t("localSession.clear")
                : t("localSession.noAutosave")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
