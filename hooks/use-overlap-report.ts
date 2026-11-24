"use client";

import { useSubtitleState } from "@/context/subtitle";
import { buildOverlapReport, type OverlapReport } from "@/lib/overlap-report";
import { useMemo } from "react";

/**
 * Derived, memoised overlap report for every track. Recomputed whenever the
 * track list changes (edits, drags, undo/redo, deletes) — no extra state.
 */
export function useOverlapReport(): OverlapReport {
  const { tracks } = useSubtitleState();
  return useMemo(() => buildOverlapReport(tracks), [tracks]);
}
