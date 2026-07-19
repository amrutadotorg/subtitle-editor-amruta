"use client";

import { useMemo } from "react";
import type { SubtitleContextType } from "./types";
import { SubtitleProvider } from "./provider";
import { useSubtitleState } from "./state";
import { useSubtitleActionsContext } from "./actions";
import { useSubtitleHistory } from "./history";
import { useSubtitles } from "./data";
import { useSubtitleTimings } from "./timing";
import { useLocalSession } from "./local-session";

export { SubtitleProvider } from "./provider";
export { useSubtitleState } from "./state";
export { useSubtitleActionsContext } from "./actions";
export { useSubtitleHistory } from "./history";
export { useSubtitles } from "./data";
export { useSubtitleTimings } from "./timing";
export { useLocalSession } from "./local-session";

export const useSubtitleContext = (): SubtitleContextType => {
  const state = useSubtitleState();
  const actions = useSubtitleActionsContext();
  const history = useSubtitleHistory();
  const subtitles = useSubtitles();

  return useMemo(
    () => ({
      ...state,
      ...actions,
      ...history,
      subtitles,
    }),
    [actions, history, state, subtitles],
  );
};
