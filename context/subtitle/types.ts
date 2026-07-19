import type { SubtitleActions } from "@/hooks/use-subtitle-actions";
import type { LocalSessionSnapshot } from "@/lib/local-session";
import type { Subtitle, SubtitleTrack } from "@/types/subtitle";
import type { ReactNode } from "react";

export interface SubtitleStateValue {
  tracks: SubtitleTrack[];
  trackCount: number;
  hasMultipleTracks: boolean;
  activeTrack: SubtitleTrack | null;
  getTrackById: (id: string) => SubtitleTrack | undefined;
  activeTrackId: string | null;
  setActiveTrackId: (id: string | null) => void;
  showTrackLabels: boolean;
  setShowTrackLabels: (value: boolean) => void;
  showSubtitleDuration: boolean;
  setShowSubtitleDuration: (value: boolean) => void;
  addSpaceOnMerge: boolean;
  setAddSpaceOnMerge: (value: boolean) => void;
  clampOverlaps: boolean;
  setClampOverlaps: (value: boolean) => void;
  playInBackground: boolean;
  setPlayInBackground: (value: boolean) => void;
  rulesMaxLineLength: number;
  setRulesMaxLineLength: (value: number) => void;
  rulesMaxCps: number;
  setRulesMaxCps: (value: number) => void;
  rulesMinDurationMs: number;
  setRulesMinDurationMs: (value: number) => void;
  rulesMaxDurationMs: number;
  setRulesMaxDurationMs: (value: number) => void;
}

export interface SubtitleHistoryValue {
  undoSubtitles: () => void;
  redoSubtitles: () => void;
  canUndoSubtitles: boolean;
  canRedoSubtitles: boolean;
}

export type SubtitleContextType = SubtitleStateValue &
  SubtitleActions &
  SubtitleHistoryValue & {
    subtitles: Subtitle[];
  };

export interface LocalSessionValue {
  pendingLocalSession: LocalSessionSnapshot | null;
  hasLocalSession: boolean;
  vimeoVideoId: string | null;
  setVimeoVideoId: (id: string | null) => void;
  restoreLocalSession: () => void;
  discardLocalSession: () => void;
  clearLocalSession: () => void;
  downloadLocalSessionBackup: (snapshot?: LocalSessionSnapshot | null) => void;
  skipAutoRestoreRef: React.MutableRefObject<boolean>;
}

interface SubtitleTimingEntry {
  uuid: string;
  start: number;
  end: number;
}

export interface SubtitleTimingState {
  list: SubtitleTimingEntry[];
  byUuid: Map<string, SubtitleTimingEntry>;
}

export interface SubtitleProviderProps {
  children: ReactNode;
}

export function ensureContext<T>(ctx: T | undefined, name: string): T {
  if (ctx === undefined) {
    throw new Error(`${name} must be used within a SubtitleProvider`);
  }
  return ctx;
}
