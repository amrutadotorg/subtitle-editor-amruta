import type { LocalSessionStorage } from "@/lib/local-session";

export const LAST_POSITION_STORAGE_KEY = "subtitle-editor:position:v1";
const LAST_POSITION_SCHEMA_VERSION = 1;
const LAST_POSITION_MAX_ENTRIES = 10;
export const LAST_POSITION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const LAST_POSITION_DEFAULT_TOLERANCE_SECONDS = 0.3;

export interface ResumeCandidate {
  uuid: string;
  trackId: string | null;
  /** Index in the track's subtitle array at write time (clamp fallback). */
  cueIndex: number;
  /** Cue start in seconds (nearest-start fallback when the uuid is gone). */
  cueStart: number;
  /** Playback time in seconds at write time. */
  time: number;
  updatedAt: number;
}

export interface LastPositionStore {
  schemaVersion: typeof LAST_POSITION_SCHEMA_VERSION;
  entries: Record<string, ResumeCandidate>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const getDefaultStorage = (): LocalSessionStorage | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage ?? null;
};

export function buildWorkspaceKey({
  trackName,
}: {
  trackName: string | null;
}): string {
  const normalizedName = (trackName ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `track:${normalizedName || "untitled"}`;
}

export function parseResumeCandidate(value: unknown): ResumeCandidate | null {
  if (!isRecord(value)) return null;

  const { uuid, cueIndex, cueStart, time, updatedAt } = value;
  if (typeof uuid !== "string" || uuid.length === 0) return null;
  if (
    !isFiniteNumber(cueIndex) ||
    !isFiniteNumber(cueStart) ||
    !isFiniteNumber(time) ||
    !isFiniteNumber(updatedAt)
  ) {
    return null;
  }

  const trackId =
    value.trackId === undefined || value.trackId === null
      ? null
      : typeof value.trackId === "string"
        ? value.trackId
        : undefined;
  if (trackId === undefined) return null;

  return {
    uuid,
    trackId,
    cueIndex,
    cueStart,
    time,
    updatedAt,
  };
}

export function parseLastPositionStore(raw: string): LastPositionStore | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.schemaVersion !== LAST_POSITION_SCHEMA_VERSION) return null;
    if (!isRecord(parsed.entries)) return null;

    const entries: Record<string, ResumeCandidate> = {};
    for (const [key, value] of Object.entries(parsed.entries)) {
      const candidate = parseResumeCandidate(value);
      if (candidate) {
        entries[key] = candidate;
      }
    }

    return { schemaVersion: LAST_POSITION_SCHEMA_VERSION, entries };
  } catch {
    return null;
  }
}

export function pruneLastPositionStore(
  store: LastPositionStore,
  now: number,
): LastPositionStore {
  const fresh = Object.entries(store.entries)
    .filter(
      ([, candidate]) => now - candidate.updatedAt <= LAST_POSITION_MAX_AGE_MS,
    )
    .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
    .slice(0, LAST_POSITION_MAX_ENTRIES);

  return {
    schemaVersion: LAST_POSITION_SCHEMA_VERSION,
    entries: Object.fromEntries(fresh),
  };
}

export function readLastPosition(
  workspaceKey: string,
  storage: LocalSessionStorage | null = getDefaultStorage(),
): ResumeCandidate | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LAST_POSITION_STORAGE_KEY);
    if (!raw) return null;
    const store = parseLastPositionStore(raw);
    if (!store) return null;

    const candidate = store.entries[workspaceKey];
    if (!candidate) return null;
    if (Date.now() - candidate.updatedAt > LAST_POSITION_MAX_AGE_MS)
      return null;

    return candidate;
  } catch {
    return null;
  }
}

export function readFreshestLastPosition(
  workspaceKeys: ReadonlyArray<string>,
  storage: LocalSessionStorage | null = getDefaultStorage(),
): ResumeCandidate | null {
  let freshest: ResumeCandidate | null = null;

  for (const workspaceKey of workspaceKeys) {
    const candidate = readLastPosition(workspaceKey, storage);
    if (candidate && (!freshest || candidate.updatedAt > freshest.updatedAt)) {
      freshest = candidate;
    }
  }

  return freshest;
}

export function writeLastPosition(
  workspaceKey: string,
  candidate: ResumeCandidate,
  storage: LocalSessionStorage | null = getDefaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(LAST_POSITION_STORAGE_KEY);
    const parsed = raw ? parseLastPositionStore(raw) : null;
    const store: LastPositionStore = parsed ?? {
      schemaVersion: LAST_POSITION_SCHEMA_VERSION,
      entries: {},
    };

    const nextStore = pruneLastPositionStore(
      {
        schemaVersion: LAST_POSITION_SCHEMA_VERSION,
        entries: { ...store.entries, [workspaceKey]: candidate },
      },
      Math.max(candidate.updatedAt, Date.now()),
    );

    storage.setItem(LAST_POSITION_STORAGE_KEY, JSON.stringify(nextStore));
    return true;
  } catch {
    return false;
  }
}

export function clearLastPosition(
  workspaceKey?: string | null,
  storage: LocalSessionStorage | null = getDefaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    if (!workspaceKey) {
      storage.removeItem(LAST_POSITION_STORAGE_KEY);
      return true;
    }

    const raw = storage.getItem(LAST_POSITION_STORAGE_KEY);
    const store = raw ? parseLastPositionStore(raw) : null;
    if (!store || !(workspaceKey in store.entries)) {
      return true;
    }

    const { [workspaceKey]: _removed, ...remaining } = store.entries;
    if (Object.keys(remaining).length === 0) {
      storage.removeItem(LAST_POSITION_STORAGE_KEY);
      return true;
    }

    storage.setItem(
      LAST_POSITION_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: LAST_POSITION_SCHEMA_VERSION,
        entries: remaining,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function resolveResumeCandidate(
  fromStore: ResumeCandidate | null,
  fromSnapshot: ResumeCandidate | undefined,
  snapshotSavedAt: number,
): ResumeCandidate | null {
  if (!fromStore && !fromSnapshot) return null;
  if (!fromStore) return fromSnapshot ?? null;
  if (!fromSnapshot) return fromStore;

  return fromStore.updatedAt >= snapshotSavedAt ? fromStore : fromSnapshot;
}

/**
 * Resolve the cue to highlight from a stored candidate.
 *
 * The `timings` array covers exactly ONE track (see `timingState` in
 * `context/subtitle/provider.tsx`, which derives from `activeSubtitles`), so
 * the target track must be selected first via `selectResumeTrackId`.
 *
 * Fallback chain: exact uuid -> nearest cue start within tolerance -> clamped
 * cue index -> null.
 */
export function resolveResumeUuid(
  candidate: ResumeCandidate,
  timings: ReadonlyArray<{ uuid: string; start: number }>,
  toleranceSeconds: number = LAST_POSITION_DEFAULT_TOLERANCE_SECONDS,
): string | null {
  if (timings.length === 0) return null;

  const exact = timings.find((entry) => entry.uuid === candidate.uuid);
  if (exact) return exact.uuid;

  let nearest: { uuid: string; start: number } | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const entry of timings) {
    const distance = Math.abs(entry.start - candidate.cueStart);
    if (distance < nearestDistance) {
      nearest = entry;
      nearestDistance = distance;
    }
  }
  if (nearest && nearestDistance <= toleranceSeconds) {
    return nearest.uuid;
  }

  const clampedIndex = Math.min(
    Math.max(0, Math.trunc(candidate.cueIndex)),
    timings.length - 1,
  );
  return timings[clampedIndex]?.uuid ?? null;
}

/**
 * Pick the track that should be active after restoring a session.
 *
 * The stored position wins over the snapshot's `activeTrackId`, but only when
 * that track still exists AND still contains the remembered cue. Pure function
 * on purpose: unit-testable without the provider.
 */
export function selectResumeTrackId(
  tracks: ReadonlyArray<{
    id: string;
    subtitles: ReadonlyArray<{ uuid: string }>;
  }>,
  candidate: ResumeCandidate | null,
  fallbackActiveTrackId: string | null,
): string | null {
  if (candidate?.trackId) {
    const candidateTrack = tracks.find(
      (track) => track.id === candidate.trackId,
    );
    if (
      candidateTrack?.subtitles.some(
        (subtitle) => subtitle.uuid === candidate.uuid,
      )
    ) {
      return candidateTrack.id;
    }
  }

  if (
    fallbackActiveTrackId &&
    tracks.some((track) => track.id === fallbackActiveTrackId)
  ) {
    return fallbackActiveTrackId;
  }

  return tracks[0]?.id ?? null;
}
