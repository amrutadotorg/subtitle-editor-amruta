import type { Subtitle, SubtitleTrack } from "@/types/subtitle";

export const LOCAL_SESSION_STORAGE_KEY = "subtitle-editor:autosave:v1";
const SETTINGS_STORAGE_KEY = "subtitle-editor:settings:v1";
export const LOCAL_SESSION_SCHEMA_VERSION = 1;

export interface LocalSessionPreferences {
  showTrackLabels: boolean;
  showSubtitleDuration: boolean;
  addSpaceOnMerge: boolean;
  clampOverlaps: boolean;
  playInBackground: boolean;
  rulesMaxLineLength?: number;
  rulesMaxCps?: number;
  rulesMinDurationMs?: number;
  rulesMaxDurationMs?: number;
}

export interface LocalSessionSnapshot {
  schemaVersion: typeof LOCAL_SESSION_SCHEMA_VERSION;
  savedAt: number;
  appVersion?: string;
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  preferences: LocalSessionPreferences;
  vimeoVideoId?: string;
}

interface CreateLocalSessionSnapshotInput {
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  preferences: LocalSessionPreferences;
  vimeoVideoId?: string;
  now?: () => number;
  appVersion?: string;
}

interface LocalSessionSignatureInput {
  tracks: SubtitleTrack[];
  activeTrackId: string | null;
  preferences: LocalSessionPreferences;
}

interface LocalSessionStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function saveSettingsToStorage(
  preferences: LocalSessionPreferences,
  storage: LocalSessionStorage = globalThis.localStorage,
): void {
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // quota exceeded or SSR — ignore
  }
}

export function loadSettingsFromStorage(
  storage: LocalSessionStorage = globalThis.localStorage,
): LocalSessionPreferences | null {
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as LocalSessionPreferences;
  } catch {
    return null;
  }
}

const HASH_OFFSET = 2166136261;
const HASH_PRIME = 16777619;

const hashString = (hash: number, value: string): number => {
  let nextHash = hash;
  for (let index = 0; index < value.length; index += 1) {
    nextHash ^= value.charCodeAt(index);
    nextHash = Math.imul(nextHash, HASH_PRIME) >>> 0;
  }
  return nextHash;
};

const hashField = (hash: number, value: string | number | boolean | null) =>
  hashString(hashString(hash, String(value).length.toString()), String(value));

const cloneSubtitle = (subtitle: Subtitle): Subtitle => ({
  uuid: subtitle.uuid,
  id: subtitle.id,
  startTime: subtitle.startTime,
  endTime: subtitle.endTime,
  text: subtitle.text,
  trackId: subtitle.trackId,
});

const cloneTrack = (track: SubtitleTrack): SubtitleTrack => ({
  id: track.id,
  name: track.name,
  subtitles: track.subtitles.map(cloneSubtitle),
  vttHeader: track.vttHeader,
  vttPrologue: track.vttPrologue ? [...track.vttPrologue] : undefined,
});

const normalizeActiveTrackId = (
  tracks: SubtitleTrack[],
  activeTrackId: string | null,
): string | null => {
  if (activeTrackId && tracks.some((track) => track.id === activeTrackId)) {
    return activeTrackId;
  }
  return tracks[0]?.id ?? null;
};

export function getLocalSessionSignature({
  tracks,
  activeTrackId,
  preferences,
}: LocalSessionSignatureInput): string {
  let hash = HASH_OFFSET;
  hash = hashField(hash, activeTrackId);
  hash = hashField(hash, preferences.showTrackLabels);
  hash = hashField(hash, preferences.showSubtitleDuration);
  hash = hashField(hash, preferences.addSpaceOnMerge);
  hash = hashField(hash, preferences.clampOverlaps);
  hash = hashField(hash, preferences.playInBackground);
  hash = hashField(hash, preferences.rulesMaxLineLength ?? 42);
  hash = hashField(hash, preferences.rulesMaxCps ?? 25);
  hash = hashField(hash, preferences.rulesMinDurationMs ?? 1000);
  hash = hashField(hash, preferences.rulesMaxDurationMs ?? 8000);
  hash = hashField(hash, tracks.length);

  for (const track of tracks) {
    hash = hashField(hash, track.id);
    hash = hashField(hash, track.name);
    hash = hashField(hash, track.vttHeader ?? null);
    hash = hashField(hash, track.vttPrologue?.length ?? 0);
    for (const prologueLine of track.vttPrologue ?? []) {
      hash = hashField(hash, prologueLine);
    }
    hash = hashField(hash, track.subtitles.length);
    for (const subtitle of track.subtitles) {
      hash = hashField(hash, subtitle.uuid);
      hash = hashField(hash, subtitle.id);
      hash = hashField(hash, subtitle.startTime);
      hash = hashField(hash, subtitle.endTime);
      hash = hashField(hash, subtitle.text);
      hash = hashField(hash, subtitle.trackId ?? null);
    }
  }

  return `${tracks.length}:${hash.toString(36)}`;
}

export function createLocalSessionSnapshot({
  tracks,
  activeTrackId,
  preferences,
  vimeoVideoId,
  now = Date.now,
  appVersion,
}: CreateLocalSessionSnapshotInput): LocalSessionSnapshot {
  const clonedTracks = tracks.map(cloneTrack);
  return {
    schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
    savedAt: now(),
    appVersion,
    tracks: clonedTracks,
    activeTrackId: normalizeActiveTrackId(clonedTracks, activeTrackId),
    preferences: { ...preferences },
    vimeoVideoId,
  };
}

export function shouldAutosaveLocalSession(
  snapshot: LocalSessionSnapshot,
): boolean {
  return snapshot.tracks.some((track) => track.subtitles.length > 0);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const parseSubtitle = (value: unknown): Subtitle | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.uuid !== "string" ||
    typeof value.id !== "number" ||
    !Number.isFinite(value.id) ||
    typeof value.startTime !== "string" ||
    typeof value.endTime !== "string" ||
    typeof value.text !== "string"
  ) {
    return null;
  }
  if (value.trackId !== undefined && typeof value.trackId !== "string") {
    return null;
  }
  return {
    uuid: value.uuid,
    id: value.id,
    startTime: value.startTime,
    endTime: value.endTime,
    text: value.text,
    trackId: value.trackId,
  };
};

const parseTrack = (value: unknown): SubtitleTrack | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !Array.isArray(value.subtitles)
  ) {
    return null;
  }
  if (value.vttHeader !== undefined && typeof value.vttHeader !== "string") {
    return null;
  }
  if (value.vttPrologue !== undefined && !isStringArray(value.vttPrologue)) {
    return null;
  }

  const subtitles = value.subtitles.map(parseSubtitle);
  if (subtitles.some((subtitle) => subtitle === null)) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    subtitles: subtitles as Subtitle[],
    vttHeader: value.vttHeader,
    vttPrologue: value.vttPrologue,
  };
};

const parsePreferences = (value: unknown): LocalSessionPreferences | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.showTrackLabels !== "boolean" ||
    typeof value.showSubtitleDuration !== "boolean" ||
    typeof value.addSpaceOnMerge !== "boolean" ||
    typeof value.clampOverlaps !== "boolean" ||
    typeof value.playInBackground !== "boolean"
  ) {
    return null;
  }

  const rulesMaxLineLength =
    typeof value.rulesMaxLineLength === "number" &&
    Number.isFinite(value.rulesMaxLineLength)
      ? value.rulesMaxLineLength
      : 42;
  const rulesMaxCps =
    typeof value.rulesMaxCps === "number" && Number.isFinite(value.rulesMaxCps)
      ? value.rulesMaxCps
      : 25;
  const rulesMinDurationMs =
    typeof value.rulesMinDurationMs === "number" &&
    Number.isFinite(value.rulesMinDurationMs)
      ? value.rulesMinDurationMs
      : 1000;
  const rulesMaxDurationMs =
    typeof value.rulesMaxDurationMs === "number" &&
    Number.isFinite(value.rulesMaxDurationMs)
      ? value.rulesMaxDurationMs
      : 8000;

  return {
    showTrackLabels: value.showTrackLabels,
    showSubtitleDuration: value.showSubtitleDuration,
    addSpaceOnMerge: value.addSpaceOnMerge,
    clampOverlaps: value.clampOverlaps,
    playInBackground: value.playInBackground,
    rulesMaxLineLength,
    rulesMaxCps,
    rulesMinDurationMs,
    rulesMaxDurationMs,
  };
};

export function parseLocalSessionSnapshot(
  raw: string,
): LocalSessionSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.schemaVersion !== LOCAL_SESSION_SCHEMA_VERSION) return null;
    if (
      typeof parsed.savedAt !== "number" ||
      !Number.isFinite(parsed.savedAt) ||
      !Array.isArray(parsed.tracks)
    ) {
      return null;
    }
    if (
      parsed.appVersion !== undefined &&
      typeof parsed.appVersion !== "string"
    ) {
      return null;
    }
    if (
      parsed.activeTrackId !== null &&
      typeof parsed.activeTrackId !== "string"
    ) {
      return null;
    }

    const tracks = parsed.tracks.map(parseTrack);
    if (tracks.length === 0 || tracks.some((track) => track === null)) {
      return null;
    }

    const preferences = parsePreferences(parsed.preferences);
    if (!preferences) return null;

    const sanitizedTracks = tracks as SubtitleTrack[];
    return {
      schemaVersion: LOCAL_SESSION_SCHEMA_VERSION,
      savedAt: parsed.savedAt,
      appVersion: parsed.appVersion,
      tracks: sanitizedTracks,
      activeTrackId: normalizeActiveTrackId(
        sanitizedTracks,
        parsed.activeTrackId,
      ),
      preferences,
      vimeoVideoId:
        typeof parsed.vimeoVideoId === "string"
          ? parsed.vimeoVideoId
          : undefined,
    };
  } catch {
    return null;
  }
}

const getDefaultStorage = (): LocalSessionStorage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage ?? null;
};

export function readLocalSessionSnapshot(
  storage: LocalSessionStorage | null = getDefaultStorage(),
): LocalSessionSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LOCAL_SESSION_STORAGE_KEY);
    return raw ? parseLocalSessionSnapshot(raw) : null;
  } catch {
    return null;
  }
}

export function writeLocalSessionSnapshot(
  snapshot: LocalSessionSnapshot,
  storage: LocalSessionStorage | null = getDefaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalSessionSnapshot(
  storage: LocalSessionStorage | null = getDefaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function buildLocalSessionBackup(
  snapshot: LocalSessionSnapshot,
): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function getLocalSessionBackupFilename(
  snapshot: LocalSessionSnapshot,
): string {
  const date = new Date(snapshot.savedAt);
  const safeDate = Number.isNaN(date.getTime())
    ? "session"
    : date.toISOString().replace(/[:.]/g, "-");
  return `subtitle-editor-autosave-${safeDate}.json`;
}
