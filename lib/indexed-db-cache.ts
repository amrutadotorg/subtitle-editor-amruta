/**
 * Cleanup helpers for IndexedDB databases that the editor no longer uses.
 *
 * The Vimeo download integration was removed, but existing users may still
 * have its `subtitle-editor-vimeo-cache` database on disk (hundreds of MB).
 * Nothing reads it any more, so it is safe to delete.
 *
 * The active peaks cache (`subtitle-editor-waveform-cache`) is deliberately
 * NOT touched here — see `lib/waveform-peaks-cache.ts`.
 */

const LEGACY_VIMEO_DB_NAME = "subtitle-editor-vimeo-cache";

/** How long a `blocked` delete may wait for other tabs before giving up. */
const BLOCKED_TIMEOUT_MS = 1500;

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    // Reading `indexedDB` can itself throw (e.g. SecurityError in private mode).
    return false;
  }
}

/**
 * Deletes an IndexedDB database without ever rejecting.
 *
 * Resolves `true` when the database is gone (including "never existed"),
 * `false` when IndexedDB is unavailable, the delete failed, or another tab
 * kept the database open for longer than `blockedTimeoutMs`.
 */
export function deleteDatabaseSafely(
  dbName: string,
  blockedTimeoutMs = BLOCKED_TIMEOUT_MS,
): Promise<boolean> {
  if (!hasIndexedDb()) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let blockedTimeout: ReturnType<typeof setTimeout> | undefined;

    const finish = (deleted: boolean) => {
      if (settled) return;
      settled = true;
      if (blockedTimeout !== undefined) clearTimeout(blockedTimeout);
      resolve(deleted);
    };

    try {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => finish(true);
      request.onerror = () => finish(false);
      request.onblocked = () => {
        // Another tab still holds the database open. Never hang the caller:
        // give up after a short grace period (a later call retries anyway).
        if (blockedTimeout !== undefined) return;
        blockedTimeout = setTimeout(() => finish(false), blockedTimeoutMs);
      };
    } catch {
      finish(false);
    }
  });
}

/**
 * Removes the orphaned `subtitle-editor-vimeo-cache` database.
 *
 * Best-effort: never rejects, safe to call on every page load, and a no-op
 * when the database does not exist.
 */
export async function clearLegacyVimeoCache(): Promise<void> {
  await deleteDatabaseSafely(LEGACY_VIMEO_DB_NAME);
}
