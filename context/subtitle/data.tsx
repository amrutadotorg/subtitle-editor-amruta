"use client";

import { createContext, useContext } from "react";
import type { Subtitle } from "@/types/subtitle";
import { ensureContext } from "./types";

export const SubtitleDataContext = createContext<Subtitle[] | undefined>(
  undefined,
);

export const useSubtitles = (): Subtitle[] => {
  const ctx = useContext(SubtitleDataContext);
  return ensureContext(ctx, "useSubtitles");
};
