"use client";

import { createContext, useContext } from "react";
import type { LocalSessionValue } from "./types";
import { ensureContext } from "./types";

export const LocalSessionContext = createContext<LocalSessionValue | undefined>(
  undefined,
);

export const useLocalSession = (): LocalSessionValue => {
  const ctx = useContext(LocalSessionContext);
  return ensureContext(ctx, "useLocalSession");
};
