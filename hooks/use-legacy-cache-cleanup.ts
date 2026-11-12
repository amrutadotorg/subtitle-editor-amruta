"use client";

import { clearLegacyVimeoCache } from "@/lib/indexed-db-cache";
import { useEffect, useRef } from "react";

/**
 * Best-effort removal of the orphaned `subtitle-editor-vimeo-cache` database
 * left behind by the removed Vimeo integration.
 *
 * Runs once per mount, never blocks the UI, and never throws. If another tab
 * holds the database open the delete is skipped and retried on the next load.
 */
export function useLegacyCacheCleanup(): void {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    void clearLegacyVimeoCache();
  }, []);
}
