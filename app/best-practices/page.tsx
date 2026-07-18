import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Top 10 Subtitling Best Practices",
  description:
    "Essential subtitling guidelines: reading speed, line length, timing, and formatting rules for professional-quality subtitles.",
  keywords: [
    "subtitling best practices",
    "subtitle guidelines",
    "SRT formatting rules",
    "subtitle reading speed",
    "subtitle line length",
    "subtitle timing",
  ],
  alternates: {
    canonical: "https://subtitle-editor.org/best-practices",
  },
  openGraph: {
    title: "Top 10 Subtitling Best Practices | Subtitle Editor",
    description:
      "Essential subtitling guidelines: reading speed, line length, timing, and formatting rules for professional-quality subtitles.",
    url: "https://subtitle-editor.org/best-practices",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Top 10 Subtitling Best Practices | Subtitle Editor",
    description:
      "Essential subtitling guidelines: reading speed, line length, timing, and formatting rules for professional-quality subtitles.",
  },
};

export default function BestPracticesPage() {
  return (
    <div className="container mx-auto py-12">
      <h1 className="text-3xl font-bold mb-6">
        Top 10 Subtitling Best Practices
      </h1>

      <section className="my-6">
        <h2 className="text-xl font-bold">
          1. Reading speed matters more than word count
        </h2>
        <p className="my-4">
          Aim for 15–17 characters per second (CPS) max — viewers need time to
          read, not just see the text flash by.
        </p>
      </section>

      <section className="my-6">
        <h2 className="text-xl font-bold">2. Respect the 2-line limit</h2>
        <p className="my-4">
          Never exceed two lines per subtitle; if a sentence needs more, split
          it into separate cues rather than cramming.
        </p>
      </section>

      <section className="my-6">
        <h2 className="text-xl font-bold">
          3. Keep line length under ~42 characters
        </h2>
        <p className="my-4">
          This is the industry standard (Netflix, BBC) to ensure readability
          across screen sizes.
        </p>
      </section>

      <section className="my-6">
        <h2 className="text-xl font-bold">4. Sync to speech, not silence</h2>
        <p className="my-4">
          Cues should appear when speech starts and disappear shortly after it
          ends — never let a subtitle linger over silence or the next
          speaker&apos;s line.
        </p>
      </section>

      <section className="my-6">
        <h2 className="text-xl font-bold">
          5. Minimum duration: 1 second. Maximum: ~6-7 seconds
        </h2>
        <p className="my-4">
          Anything shorter feels like a flash; anything longer tempts re-reading
          and breaks pacing.
        </p>
      </section>

      <section className="my-6">
        <h2 className="text-xl font-bold">
          6. Break lines at natural grammatical points
        </h2>
        <p className="my-4">
          Split at conjunctions, punctuation, or clause boundaries — never
          mid-phrase (e.g., don&apos;t separate an adjective from its noun).
        </p>
      </section>

      <section className="my-6">
        <h2 className="text-xl font-bold">
          7. One idea per line when possible
        </h2>
        <p className="my-4">
          Each line should be a coherent chunk of meaning, not an arbitrary
          character-count cutoff.
        </p>
      </section>

      <section className="my-6">
        <h2 className="text-xl font-bold">
          8. Leave a gap between consecutive subtitles
        </h2>
        <p className="my-4">
          A minimum 2–3 frame gap (even if imperceptible) helps the brain
          register a new cue has appeared.
        </p>
      </section>

      <section className="my-6">
        <h2 className="text-xl font-bold">9. Don&apos;t over-punctuate</h2>
        <p className="my-4">
          Skip unnecessary ellipses, exclamation marks, or ALL CAPS — let tone
          come through context, not typographic noise.
        </p>
      </section>

      <section className="my-6">
        <h2 className="text-xl font-bold">
          10. Preserve speaker intent over literal transcription
        </h2>
        <p className="my-4">
          Light editing (removing filler words, false starts) is expected —
          subtitles should read naturally, not transcribe verbatim disfluencies.
        </p>
      </section>

      <Button asChild variant="secondary" className="my-8">
        <Link href="/">Back to Editor</Link>
      </Button>
    </div>
  );
}
