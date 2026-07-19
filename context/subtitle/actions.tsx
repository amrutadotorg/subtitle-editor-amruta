"use client";

import { createContext, useContext } from "react";
import type { SubtitleActions } from "@/hooks/use-subtitle-actions";
import { ensureContext } from "./types";

export const SubtitleActionsContext = createContext<
  SubtitleActions | undefined
>(undefined);

export const useSubtitleActionsContext = (): SubtitleActions => {
  const ctx = useContext(SubtitleActionsContext);
  return ensureContext(ctx, "useSubtitleActionsContext");
};
