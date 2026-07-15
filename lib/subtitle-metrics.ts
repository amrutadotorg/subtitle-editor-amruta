import type { Subtitle } from "@/types/subtitle";
import { timeToSeconds } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

interface MetricsThresholds {
  maxCps: number;
  maxWpm: number;
  maxLineLength: number;
  maxLines: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
}

export const METRICS_THRESHOLDS: MetricsThresholds = {
  /** Characters per second — Netflix/BBC conservative default */
  maxCps: 20,
  /** Words per minute */
  maxWpm: 180,
  /** Maximum characters on any single line */
  maxLineLength: 42,
  /** Maximum number of text lines per cue */
  maxLines: 2,
  /** Minimum cue duration in seconds */
  minDurationSeconds: 1.0,
  /** Maximum cue duration in seconds */
  maxDurationSeconds: 7.0,
};

// ---------------------------------------------------------------------------
// Per-cue types
// ---------------------------------------------------------------------------

export type CueWarningKind =
  | "cps_high"
  | "wpm_high"
  | "line_length"
  | "too_many_lines"
  | "duration_short"
  | "duration_long";

export interface CueWarning {
  kind: CueWarningKind;
  /** Human-readable detail values for i18n interpolation */
  value: number;
  threshold: number;
}

interface CueMetrics {
  uuid: string;
  id: number;
  durationSeconds: number;
  wordCount: number;
  charCount: number;
  /** Characters per second (0 when duration = 0) */
  cps: number;
  /** Words per minute (0 when duration = 0) */
  wpm: number;
  lineCount: number;
  maxLineLength: number;
  /** Gap to the previous cue's end, in seconds. null for the first cue. */
  gapBefore: number | null;
  /** Gap to the next cue's start, in seconds. null for the last cue. */
  gapAfter: number | null;
  warnings: CueWarning[];
}

// ---------------------------------------------------------------------------
// Track-level types
// ---------------------------------------------------------------------------

interface RepeatedLine {
  text: string;
  count: number;
}

interface WordFrequency {
  word: string;
  count: number;
}

interface TrackMetrics {
  totalCues: number;
  totalWords: number;
  totalChars: number;
  /** Total seconds the subtitles are displayed (sum of durations) */
  totalSubtitleDisplayTime: number;
  averageDuration: number;
  maxCps: number;
  maxWpm: number;
  /** Number of cues that have at least one warning */
  cuesWithWarnings: number;
  /** Top 5 repeated (non-empty) line texts, sorted descending by count */
  mostRepeatedLines: RepeatedLine[];
  /** Top 10 most frequent words across all cues, sorted descending by count */
  topWords: WordFrequency[];
  /** Per-cue metrics in track order */
  perCue: CueMetrics[];
}

// ---------------------------------------------------------------------------
// Per-cue computation
// ---------------------------------------------------------------------------

/**
 * Compute metrics and warnings for a single subtitle cue.
 *
 * @param subtitle  The cue to analyse.
 * @param prevEndSeconds  End time of the previous cue (null for first cue).
 * @param nextStartSeconds  Start time of the next cue (null for last cue).
 * @param thresholds  Override defaults for testing.
 */
export function computeCueMetrics(
  subtitle: Subtitle,
  prevEndSeconds: number | null,
  nextStartSeconds: number | null,
  thresholds: MetricsThresholds = METRICS_THRESHOLDS,
): CueMetrics {
  const startSeconds = timeToSeconds(subtitle.startTime);
  const endSeconds = timeToSeconds(subtitle.endTime);
  const durationSeconds = Math.max(0, endSeconds - startSeconds);

  const trimmedText = subtitle.text.trim();
  const wordCount =
    trimmedText.length > 0 ? trimmedText.split(/\s+/).length : 0;
  const charCount = Array.from(subtitle.text).length;

  const cps = durationSeconds > 0 ? charCount / durationSeconds : 0;
  const wpm = durationSeconds > 0 ? wordCount / (durationSeconds / 60) : 0;

  const lines = subtitle.text.split("\n");
  const lineCount = lines.length;
  const maxLineLengthValue = lines.reduce(
    (max, line) => Math.max(max, Array.from(line).length),
    0,
  );

  const gapBefore =
    prevEndSeconds !== null ? startSeconds - prevEndSeconds : null;
  const gapAfter =
    nextStartSeconds !== null ? nextStartSeconds - endSeconds : null;

  const warnings: CueWarning[] = [];

  if (cps > thresholds.maxCps) {
    warnings.push({
      kind: "cps_high",
      value: cps,
      threshold: thresholds.maxCps,
    });
  }
  if (wpm > thresholds.maxWpm) {
    warnings.push({
      kind: "wpm_high",
      value: wpm,
      threshold: thresholds.maxWpm,
    });
  }
  if (maxLineLengthValue > thresholds.maxLineLength) {
    warnings.push({
      kind: "line_length",
      value: maxLineLengthValue,
      threshold: thresholds.maxLineLength,
    });
  }
  if (lineCount > thresholds.maxLines) {
    warnings.push({
      kind: "too_many_lines",
      value: lineCount,
      threshold: thresholds.maxLines,
    });
  }
  if (durationSeconds < thresholds.minDurationSeconds) {
    warnings.push({
      kind: "duration_short",
      value: durationSeconds,
      threshold: thresholds.minDurationSeconds,
    });
  } else if (durationSeconds > thresholds.maxDurationSeconds) {
    warnings.push({
      kind: "duration_long",
      value: durationSeconds,
      threshold: thresholds.maxDurationSeconds,
    });
  }

  return {
    uuid: subtitle.uuid,
    id: subtitle.id,
    durationSeconds,
    wordCount,
    charCount,
    cps,
    wpm,
    lineCount,
    maxLineLength: maxLineLengthValue,
    gapBefore,
    gapAfter,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Track-level computation
// ---------------------------------------------------------------------------

const WORD_SPLIT_RE = /[\s\p{P}]+/u;
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "it",
  "as",
  "be",
  "this",
  "that",
  "was",
  "are",
  "were",
  "been",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "not",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "my",
  "your",
]);

/**
 * Compute track-level metrics for an ordered array of subtitles.
 *
 * @param subtitles  All cues in the track, in display order.
 * @param thresholds  Override defaults for testing.
 */
export function computeTrackMetrics(
  subtitles: Subtitle[],
  thresholds: MetricsThresholds = METRICS_THRESHOLDS,
): TrackMetrics {
  const perCue: CueMetrics[] = subtitles.map((subtitle, index) => {
    const prev = index > 0 ? subtitles[index - 1] : null;
    const next = index < subtitles.length - 1 ? subtitles[index + 1] : null;
    const prevEndSeconds = prev ? timeToSeconds(prev.endTime) : null;
    const nextStartSeconds = next ? timeToSeconds(next.startTime) : null;
    return computeCueMetrics(
      subtitle,
      prevEndSeconds,
      nextStartSeconds,
      thresholds,
    );
  });

  const totalCues = perCue.length;
  const totalWords = perCue.reduce((sum, c) => sum + c.wordCount, 0);
  const totalChars = perCue.reduce((sum, c) => sum + c.charCount, 0);
  const totalSubtitleDisplayTime = perCue.reduce(
    (sum, c) => sum + c.durationSeconds,
    0,
  );
  const averageDuration =
    totalCues > 0 ? totalSubtitleDisplayTime / totalCues : 0;
  const maxCps = perCue.reduce((max, c) => Math.max(max, c.cps), 0);
  const maxWpm = perCue.reduce((max, c) => Math.max(max, c.wpm), 0);
  const cuesWithWarnings = perCue.filter((c) => c.warnings.length > 0).length;

  // --- Repeated lines ---
  const lineFreq = new Map<string, number>();
  for (const subtitle of subtitles) {
    for (const rawLine of subtitle.text.split("\n")) {
      const line = rawLine.trim();
      if (line.length > 0) {
        lineFreq.set(line, (lineFreq.get(line) ?? 0) + 1);
      }
    }
  }
  const mostRepeatedLines: RepeatedLine[] = [...lineFreq.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([text, count]) => ({ text, count }));

  // --- Top words ---
  const wordFreq = new Map<string, number>();
  for (const subtitle of subtitles) {
    const tokens = subtitle.text
      .toLowerCase()
      .split(WORD_SPLIT_RE)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
    for (const token of tokens) {
      wordFreq.set(token, (wordFreq.get(token) ?? 0) + 1);
    }
  }
  const topWords: WordFrequency[] = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  return {
    totalCues,
    totalWords,
    totalChars,
    totalSubtitleDisplayTime,
    averageDuration,
    maxCps,
    maxWpm,
    cuesWithWarnings,
    mostRepeatedLines,
    topWords,
    perCue,
  };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable plain-text report for a track's metrics.
 *
 * @param trackName  Display name of the track.
 * @param metrics    Pre-computed track metrics.
 */
export function generateTextReport(
  trackName: string,
  metrics: TrackMetrics,
): string {
  const fmt = (n: number, decimals = 1) => n.toFixed(decimals);
  const lines: string[] = [];

  lines.push(`Subtitle Statistics Report — ${trackName}`);
  lines.push("=".repeat(50));
  lines.push("");

  lines.push("TRACK SUMMARY");
  lines.push("-".repeat(30));
  lines.push(`Total cues:              ${metrics.totalCues}`);
  lines.push(`Total words:             ${metrics.totalWords}`);
  lines.push(`Total characters:        ${metrics.totalChars}`);
  lines.push(
    `Total display time:      ${fmt(metrics.totalSubtitleDisplayTime)}s`,
  );
  lines.push(`Average duration:        ${fmt(metrics.averageDuration)}s`);
  lines.push(`Max CPS:                 ${fmt(metrics.maxCps)}`);
  lines.push(`Max WPM:                 ${fmt(metrics.maxWpm)}`);
  lines.push(`Cues with warnings:      ${metrics.cuesWithWarnings}`);
  lines.push("");

  if (metrics.mostRepeatedLines.length > 0) {
    lines.push("REPEATED LINES");
    lines.push("-".repeat(30));
    for (const { text, count } of metrics.mostRepeatedLines) {
      lines.push(`  ×${count}  ${text}`);
    }
    lines.push("");
  }

  if (metrics.topWords.length > 0) {
    lines.push("TOP WORDS");
    lines.push("-".repeat(30));
    for (const { word, count } of metrics.topWords) {
      lines.push(`  ${word}: ${count}`);
    }
    lines.push("");
  }

  const offenders = [...metrics.perCue]
    .filter((c) => c.warnings.length > 0)
    .sort((a, b) => b.cps - a.cps)
    .slice(0, 20);

  if (offenders.length > 0) {
    lines.push("CUES WITH WARNINGS (sorted by CPS)");
    lines.push("-".repeat(30));
    lines.push(
      `${"ID".padEnd(6)} ${"Duration".padEnd(10)} ${"CPS".padEnd(8)} ${"WPM".padEnd(8)} Warnings`,
    );
    for (const cue of offenders) {
      const warnList = cue.warnings.map((w) => w.kind).join(", ");
      lines.push(
        `${String(cue.id).padEnd(6)} ${`${fmt(cue.durationSeconds)}s`.padEnd(10)} ${fmt(cue.cps).padEnd(8)} ${fmt(cue.wpm).padEnd(8)} ${warnList}`,
      );
    }
    lines.push("");
  }

  lines.push(`Generated by Subtitle Editor · ${new Date().toISOString()}`);
  return lines.join("\n");
}
