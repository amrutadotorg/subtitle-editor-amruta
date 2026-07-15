import { escapeRegExp } from "./utils";

interface FindRegexOptions {
  isCaseSensitive: boolean;
  isMatchFullWord: boolean;
  isRegexMode: boolean;
}

interface FindRegexConfig {
  source: string;
  flags: string;
}

export function getFindRegexConfig(
  findText: string,
  options: FindRegexOptions,
): FindRegexConfig | null {
  if (!findText) {
    return null;
  }

  const flags = options.isCaseSensitive ? "g" : "gi";

  try {
    if (options.isRegexMode) {
      // Validate user supplied pattern before returning config
      new RegExp(findText, flags);
      return { source: findText, flags };
    }

    const safePattern = options.isMatchFullWord
      ? `\\b${escapeRegExp(findText)}\\b`
      : escapeRegExp(findText);

    new RegExp(safePattern, flags);
    return { source: safePattern, flags };
  } catch {
    return null;
  }
}
