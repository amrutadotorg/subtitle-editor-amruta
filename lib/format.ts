import type { OverlapDownloadFormat } from "@/lib/overlap-report";
import type { Subtitle, SubtitleTrack } from "@/types/subtitle";

const flattenSubtitleText = (subtitle: Subtitle): string => {
  const text = stripVttStyling(subtitle.text, false);
  return text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
};

const toCsvCell = (value: string | number): string => {
  const cell = String(value);
  if (cell === "") return '""';
  if (/[",\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
};

export const buildSrtContent = (subtitles: Subtitle[]): string => {
  return subtitles
    .map((subtitle, index) => {
      const cueIndex = Number.isFinite(subtitle.id) ? subtitle.id : 0;
      const cueId = cueIndex > 0 ? cueIndex : index + 1;
      return `${cueId}\n${subtitle.startTime} --> ${subtitle.endTime}\n${subtitle.text}\n`;
    })
    .join("\n");
};

export const subtitlesToVttString = (
  subtitles: Subtitle[],
  header: string = "WEBVTT",
): string => {
  const safeHeader = header.trim().length > 0 ? header.trim() : "WEBVTT";
  const body = subtitles
    .map((subtitle, index) => {
      const cueIndex = Number.isFinite(subtitle.id) ? subtitle.id : 0;
      const cueId = cueIndex > 0 ? cueIndex : index + 1;
      const start = subtitle.startTime.replace(",", ".");
      const end = subtitle.endTime.replace(",", ".");
      return `${cueId}\n${start} --> ${end}\n${subtitle.text}\n`;
    })
    .join("\n");
  return `${safeHeader}\n\n${body.endsWith("\n") ? body : `${body}\n`}`;
};

export const buildPlainTextContent = (subtitles: Subtitle[]): string => {
  return subtitles.map((subtitle) => flattenSubtitleText(subtitle)).join("\n");
};

export const buildCsvContent = (subtitles: Subtitle[]): string => {
  const header = ["id", "start_time", "end_time", "text"];
  const rows = subtitles.map((subtitle) => [
    subtitle.id,
    subtitle.startTime,
    subtitle.endTime,
    flattenSubtitleText(subtitle),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
};

export const buildVttContent = (
  subtitles: Subtitle[],
  opts?: { header?: string; prologue?: string[] },
): string => {
  const header = opts?.header ?? "WEBVTT";
  const base = subtitlesToVttString(subtitles, header);
  if (!opts?.prologue || opts.prologue.length === 0) return base;
  const blocks = opts.prologue.join("\n\n");
  // Insert prologue blocks (NOTE/STYLE/REGION) after header and before cues
  const [first, ...rest] = base.split(/\n\n/);
  return [first, blocks, rest.join("\n\n")].filter(Boolean).join("\n\n");
};

// Optional helper for SRT export if we decide to strip VTT-only tags.
const stripVttStyling = (text: string, allowBasic = true): string => {
  if (!allowBasic) return text.replace(/<\/?[^>]+>/g, "");
  // Remove all tags except <i>, <b>, <u>
  return text.replace(/<(?!\/?(?:i|b|u)\b)[^>]+>/g, "");
};

/** A downloadable file assembled from one track. */
export interface TrackFile {
  fileName: string;
  content: string;
  mime: string;
}

/**
 * Builds the exact bytes a track exports for `format` — no repair, no
 * reordering. The name keeps the user's track name with whitespace replaced.
 */
export const buildTrackFile = (
  track: SubtitleTrack,
  format: OverlapDownloadFormat,
): TrackFile => {
  let content: string;
  if (format === "vtt") {
    content = buildVttContent(track.subtitles, {
      header: track.vttHeader,
      prologue: track.vttPrologue,
    });
  } else if (format === "csv") {
    content = buildCsvContent(track.subtitles);
  } else if (format === "txt") {
    content = buildPlainTextContent(track.subtitles);
  } else {
    content = buildSrtContent(track.subtitles);
  }
  const mime =
    format === "vtt"
      ? "text/vtt"
      : format === "csv"
        ? "text/csv"
        : "text/plain";
  const safeName = (track.name || "subtitles").replace(/\s+/g, "_");
  return { fileName: `${safeName}.${format}`, content, mime };
};
