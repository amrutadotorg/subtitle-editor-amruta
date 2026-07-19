import path from "node:path";

/**
 * Resolves a safe absolute path for a file inside a base directory,
 * preventing path traversal attacks.
 *
 * @param baseDir The absolute path to the base directory.
 * @param fileName The name or relative path of the file to resolve.
 * @returns The resolved absolute path if safe, or null if it escapes the base directory.
 */
export function resolveSafePath(
  baseDir: string,
  fileName: string,
): string | null {
  const safeDirPrefix = baseDir.endsWith(path.sep)
    ? baseDir
    : `${baseDir}${path.sep}`;
  const filePath = path.resolve(baseDir, fileName);

  if (!filePath.startsWith(safeDirPrefix)) {
    return null;
  }

  return filePath;
}
