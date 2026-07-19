"use client";

import { createContext, useContext } from "react";
import type { SubtitleHistoryValue } from "./types";
import { ensureContext } from "./types";

export const SubtitleHistoryContext = createContext<
  SubtitleHistoryValue | undefined
>(undefined);

export const useSubtitleHistory = (): SubtitleHistoryValue => {
  const ctx = useContext(SubtitleHistoryContext);
  return ensureContext(ctx, "useSubtitleHistory");
};
