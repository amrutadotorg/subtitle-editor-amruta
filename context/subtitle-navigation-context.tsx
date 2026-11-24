"use client";

import { createContext, useContext } from "react";

interface SubtitleNavigationContextValue {
  navigateToSubtitle: (uuid: string) => void;
  /** Navigates to a cue in any track, switching the active track when needed. */
  navigateToSubtitleInTrack: (trackId: string, uuid: string) => void;
}

const SubtitleNavigationContext = createContext<SubtitleNavigationContextValue>(
  {
    navigateToSubtitle: () => {},
    navigateToSubtitleInTrack: () => {},
  },
);

export const SubtitleNavigationProvider = SubtitleNavigationContext.Provider;

export function useSubtitleNavigation() {
  return useContext(SubtitleNavigationContext);
}
