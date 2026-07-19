"use client";

import { createContext, useContext } from "react";
import type { SubtitleStateValue } from "./types";
import { ensureContext } from "./types";

export const SubtitleStateContext = createContext<
  SubtitleStateValue | undefined
>(undefined);

export const useSubtitleState = (): SubtitleStateValue => {
  const ctx = useContext(SubtitleStateContext);
  return ensureContext(ctx, "useSubtitleState");
};
