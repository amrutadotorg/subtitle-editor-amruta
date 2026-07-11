"use client";

import { createContext, useContext } from "react";

export interface SubtitleNavigationContextValue {
  navigateToSubtitle: (uuid: string) => void;
}

const SubtitleNavigationContext = createContext<SubtitleNavigationContextValue>({
  navigateToSubtitle: () => {},
});

export const SubtitleNavigationProvider = SubtitleNavigationContext.Provider;

export function useSubtitleNavigation() {
  return useContext(SubtitleNavigationContext);
}
