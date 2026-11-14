# State and persistence

Global state is split across **six React contexts** in `context/subtitle/` so that a track edit does not re-render the waveform. `provider.tsx` wires them together; `index.tsx` re-exports the hooks. Import from the barrel, not from individual files.

| File                | Context / hook                                         | Holds                              |
| ------------------- | ------------------------------------------------------ | ---------------------------------- |
| `state.tsx`         | `SubtitleStateContext` / `useSubtitleState`            | active track, shared state         |
| `actions.tsx`       | `SubtitleActionsContext` / `useSubtitleActionsContext` | mutators                           |
| `history.tsx`       | `SubtitleHistoryContext` / `useSubtitleHistory`        | per-track undo/redo                |
| `data.tsx`          | `SubtitleDataContext` / `useSubtitles`                 | cues, tracks                       |
| `timing.tsx`        | `SubtitleTimingContext` / `useSubtitleTimings`         | playback/timing                    |
| `local-session.tsx` | `LocalSessionContext` / `useLocalSession`              | autosave/restore state             |
| `types.ts`          | —                                                      | shared interfaces, `ensureContext` |

## Undo/redo

`hooks/use-undoable-state.ts` keeps `past / present / future` per track, capped at 50 entries (`MAX_HISTORY_LENGTH`). History is per track — switching tracks must not share history. `hooks/use-track-history-sync.ts` wires history to track changes; touch it carefully.

## Local session autosave

- Snapshot is written to localStorage with a **750 ms debounce** (`hooks/use-local-session-orchestration.ts`, `lib/local-session.ts`).
- `getLocalSessionSignature()` in `lib/local-session.ts` decides whether the snapshot is materially different. **Do not add the last-played position to it** — the signature is what suppresses redundant writes, and position changes every few seconds.
- The last-worked cue position (written on pause/interaction) lives under `subtitle-editor:position:v1` and is added to the snapshot as `lastPosition`. See `lib/last-position.ts`.
- Settings are persisted independently from the session snapshot.
- "Clear autosave" restores the initial state; it does **not** clear the waveform peaks cache (different data, expensive to rebuild).

## Waveform peaks cache

For local media larger than 100 MB (`.mp4`, `.m4a`, `.mov`):

- IndexedDB database `subtitle-editor-waveform-cache`, store `peaks`.
- Key: `local:v1:<encoded-name>:<size>:<lastModified>` — size and mtime are part of the identity, so replacing a file invalidates naturally.
- Value: `{ peaks: Float32Array; duration: number; updatedAt: number }`, LRU-capped at 20 entries.
- Best-effort: `setCachedPeaks` never rejects; a cache failure must never block playback.
- Implementation: `lib/waveform-peaks-cache.ts`; consumers: `components/waveform-visualizer/use-waveform-peaks.ts` (threshold check at `mediaFile.size > 100 * 1024 * 1024`).

## Legacy IndexedDB cleanup

The orphaned `subtitle-editor-vimeo-cache` database (from the removed Vimeo integration) is deleted best-effort:

- on every editor mount — `hooks/use-legacy-cache-cleanup.ts`
- again by "Clear autosave" — `clearLocalSession` in `lib/local-session.ts`

Deletion is idempotent, never rejects, and gives up after 1.5 s if another tab holds the database open (retried on next load). It must never touch the peaks cache. Implementation: `lib/indexed-db-cache.ts`.

## Adding cache-like state

Follow the existing shape: pure cache module in `lib/`, thin hook in `hooks/`, orchestration in the context provider. Do not put IndexedDB or localStorage access directly in a component.
