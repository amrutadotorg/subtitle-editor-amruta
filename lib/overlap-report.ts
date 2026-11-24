import { timeToSeconds } from "@/lib/utils";
import type { Subtitle, SubtitleTrack } from "@/types/subtitle";

// ---------------------------------------------------------------------------
// Report shape
// ---------------------------------------------------------------------------

/** A cue as it appears in the overlap report — stable identity is `uuid`. */
export interface OverlapCueRef {
  uuid: string;
  id: number;
  start: string;
  end: string;
}

/**
 * Two cues of the same track whose times intersect.
 * `a` is the earlier cue (chronologically first) and `b` the later one.
 */
export interface OverlapPair {
  trackId: string;
  a: OverlapCueRef;
  b: OverlapCueRef;
  /** Duration of the shared interval in whole milliseconds (always >= 1). */
  overlapMs: number;
}

/** A cue with `end <= start` (including zero length) or unparseable times. */
export interface InvalidTimingEntry {
  trackId: string;
  cue: OverlapCueRef;
}

export interface TrackOverlapCounts {
  overlaps: number;
  invalid: number;
}

export interface OverlapReport {
  pairs: OverlapPair[];
  invalidTiming: InvalidTimingEntry[];
  countsByTrack: Record<string, TrackOverlapCounts>;
}

/** One cue that a given cue collides with, as seen from that cue's row. */
export interface OverlapPartner {
  cue: OverlapCueRef;
  overlapMs: number;
}

export type OverlapPartnersByUuid = Record<string, OverlapPartner[]>;

/**
 * Presentation cap for the report surfaces. Counters always report the full
 * number of pairs; only the rendered list is truncated.
 */
export const OVERLAP_PAIR_DISPLAY_LIMIT = 100;

/** Formats offered by the save dialog; only some carry cue timings. */
export type OverlapDownloadFormat = "srt" | "vtt" | "txt" | "csv";

/**
 * Whether saving `format` for a track with `counts` needs a confirmation first.
 * TXT and CSV drop the cue timings, so an overlap cannot corrupt them.
 */
export const needsOverlapConfirmation = (
  format: OverlapDownloadFormat,
  counts: TrackOverlapCounts | undefined,
): boolean =>
  (format === "srt" || format === "vtt") && (counts?.overlaps ?? 0) > 0;

/** Renders an overlap duration in seconds with millisecond precision. */
export function formatOverlapSeconds(overlapMs: number): string {
  return (overlapMs / 1000).toFixed(3);
}

/**
 * The rows a single track contributes to a report surface: its pairs capped at
 * the display limit, its invalid timings (uncapped) and how many pairs the cap
 * hid. The cap is applied per track so one huge track cannot starve the others;
 * counters elsewhere always use the full `countsByTrack` numbers.
 */
export function selectTrackOverlapRows(
  report: OverlapReport,
  trackId: string,
): {
  pairs: OverlapPair[];
  invalidTiming: InvalidTimingEntry[];
  hiddenPairCount: number;
} {
  const trackPairs = report.pairs.filter((pair) => pair.trackId === trackId);
  const pairs = trackPairs.slice(0, OVERLAP_PAIR_DISPLAY_LIMIT);
  return {
    pairs,
    invalidTiming: report.invalidTiming.filter(
      (entry) => entry.trackId === trackId,
    ),
    hiddenPairCount: trackPairs.length - pairs.length,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface DecoratedCue {
  cue: OverlapCueRef;
  startMs: number;
  endMs: number;
}

/** A pair plus the numeric bounds needed for chronological sorting. */
interface DecoratedPair {
  pair: OverlapPair;
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
}

const toMilliseconds = (time: string): number =>
  Math.round(timeToSeconds(time) * 1000);

const toCueRef = (subtitle: Subtitle): OverlapCueRef => ({
  uuid: subtitle.uuid,
  id: subtitle.id,
  start: subtitle.startTime,
  end: subtitle.endTime,
});

const decorateCue = (subtitle: Subtitle): DecoratedCue => ({
  cue: toCueRef(subtitle),
  startMs: toMilliseconds(subtitle.startTime),
  endMs: toMilliseconds(subtitle.endTime),
});

const hasValidTiming = (cue: DecoratedCue): boolean =>
  Number.isFinite(cue.startMs) &&
  Number.isFinite(cue.endMs) &&
  cue.endMs > cue.startMs;

const compareCueOrder = (a: DecoratedCue, b: DecoratedCue): number =>
  a.startMs - b.startMs ||
  a.endMs - b.endMs ||
  a.cue.id - b.cue.id ||
  a.cue.uuid.localeCompare(b.cue.uuid);

/** Pairs are chronological: by the overlap start (the later cue), then end/id. */
const comparePairOrder = (a: DecoratedPair, b: DecoratedPair): number =>
  a.bStart - b.bStart ||
  a.bEnd - b.bEnd ||
  a.pair.b.id - b.pair.b.id ||
  a.aStart - b.aStart ||
  a.aEnd - b.aEnd ||
  a.pair.a.id - b.pair.a.id ||
  a.pair.a.uuid.localeCompare(b.pair.a.uuid) ||
  a.pair.b.uuid.localeCompare(b.pair.b.uuid);

// ---------------------------------------------------------------------------
// Per-track detection
// ---------------------------------------------------------------------------

/**
 * Detects overlapping cue pairs and invalid timings inside a single track.
 *
 * Uses a sort + active-set sweep (O(n log n + pairs)): cues are visited in
 * chronological order and each later cue is compared with every earlier cue
 * that still reaches into it, so nested cues and chains report every pair
 * exactly once regardless of the input array order.
 */
export function buildTrackOverlapReport(
  track: Pick<SubtitleTrack, "id" | "subtitles">,
): {
  pairs: OverlapPair[];
  invalidTiming: InvalidTimingEntry[];
  counts: TrackOverlapCounts;
} {
  const valid: DecoratedCue[] = [];
  const invalid: DecoratedCue[] = [];

  for (const subtitle of track.subtitles) {
    const cue = decorateCue(subtitle);
    if (hasValidTiming(cue)) {
      valid.push(cue);
    } else {
      invalid.push(cue);
    }
  }

  valid.sort(compareCueOrder);

  const decoratedPairs: DecoratedPair[] = [];

  for (let earlierIndex = 0; earlierIndex < valid.length; earlierIndex += 1) {
    const earlier = valid[earlierIndex];
    if (!earlier) {
      continue;
    }
    for (
      let laterIndex = earlierIndex + 1;
      laterIndex < valid.length;
      laterIndex += 1
    ) {
      const later = valid[laterIndex];
      if (!later) {
        continue;
      }
      // The array is sorted by start, so every following cue starts even later.
      if (later.startMs >= earlier.endMs) {
        break;
      }
      const overlapMs = Math.min(earlier.endMs, later.endMs) - later.startMs;
      decoratedPairs.push({
        pair: {
          trackId: track.id,
          a: earlier.cue,
          b: later.cue,
          overlapMs,
        },
        aStart: earlier.startMs,
        aEnd: earlier.endMs,
        bStart: later.startMs,
        bEnd: later.endMs,
      });
    }
  }

  decoratedPairs.sort(comparePairOrder);

  const invalidTiming = invalid
    .slice()
    .sort(
      (a, b) =>
        (Number.isFinite(a.startMs) ? a.startMs : Number.POSITIVE_INFINITY) -
          (Number.isFinite(b.startMs) ? b.startMs : Number.POSITIVE_INFINITY) ||
        (Number.isFinite(a.endMs) ? a.endMs : Number.POSITIVE_INFINITY) -
          (Number.isFinite(b.endMs) ? b.endMs : Number.POSITIVE_INFINITY) ||
        a.cue.id - b.cue.id ||
        a.cue.uuid.localeCompare(b.cue.uuid),
    )
    .map((cue) => ({ trackId: track.id, cue: cue.cue }));

  return {
    pairs: decoratedPairs.map((entry) => entry.pair),
    invalidTiming,
    counts: {
      overlaps: decoratedPairs.length,
      invalid: invalidTiming.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Whole-workspace report
// ---------------------------------------------------------------------------

/** Builds the report for every track, isolated per track and in input order. */
export function buildOverlapReport(tracks: SubtitleTrack[]): OverlapReport {
  const report: OverlapReport = {
    pairs: [],
    invalidTiming: [],
    countsByTrack: {},
  };

  for (const track of tracks) {
    const trackReport = buildTrackOverlapReport(track);
    for (const pair of trackReport.pairs) {
      report.pairs.push(pair);
    }
    for (const entry of trackReport.invalidTiming) {
      report.invalidTiming.push(entry);
    }
    report.countsByTrack[track.id] = trackReport.counts;
  }

  return report;
}

/**
 * Flips the flat pair list into a per-cue view: for every cue uuid, the list of
 * cues it collides with (with the shared duration). Computed once per report so
 * cue rows never walk the pair list themselves.
 */
export function buildOverlapPartnerMap(
  report: OverlapReport,
): OverlapPartnersByUuid {
  const byUuid: OverlapPartnersByUuid = {};

  const add = (uuid: string, partner: OverlapPartner) => {
    const partners = byUuid[uuid] ?? [];
    partners.push(partner);
    byUuid[uuid] = partners;
  };

  for (const pair of report.pairs) {
    add(pair.a.uuid, { cue: pair.b, overlapMs: pair.overlapMs });
    add(pair.b.uuid, { cue: pair.a, overlapMs: pair.overlapMs });
  }

  return byUuid;
}
