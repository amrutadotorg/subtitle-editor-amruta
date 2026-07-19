"use client";

import { createContext, useContext } from "react";
import type { SubtitleTimingState } from "./types";
import { ensureContext } from "./types";

export const SubtitleTimingContext = createContext<
  SubtitleTimingState | undefined
>(undefined);

export const useSubtitleTimings = (): SubtitleTimingState => {
  const ctx = useContext(SubtitleTimingContext);
  return ensureContext(ctx, "useSubtitleTimings");
};
