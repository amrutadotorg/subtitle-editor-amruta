# Architecture

A browser-based SRT/VTT subtitle editor. Everything runs client-side after SSO verification; there is no database and no server-side subtitle storage. Three narrow API routes exist to read files from mounted directories.

## Stack

Version numbers drift — check `package.json` rather than trusting this table.

| Layer       | Technology                                                                        |
| ----------- | --------------------------------------------------------------------------------- |
| Framework   | Next.js 16 App Router, standalone output, Turbopack in dev, webpack in build      |
| UI          | React 19 + React Compiler (`reactCompiler: true`, intentional)                    |
| Language    | TypeScript 6, strict                                                              |
| Styling     | Tailwind CSS 4 (CSS-based config in `app/globals.css`), Radix colors, cva, `cn()` |
| Components  | shadcn/ui New York + Radix primitives, `@tabler/icons-react`                      |
| State       | Split React Contexts in `context/subtitle/`, custom hooks                         |
| i18n        | next-intl, 13 locales, deep-merged fallback to English                            |
| Media       | wavesurfer.js 7 + `@wavesurfer/react`, mp4box for MP4 parsing                     |
| Tests       | Node test runner via `tsx`, Testing Library, jsdom                                |
| Lint/format | ESLint 9 (core-web-vitals) + Biome 2 (formatter only)                             |
| PWA         | `@ducanh2912/next-pwa`                                                            |

## Layout

```
app/
  [locale]/            editor route (SSO + next-intl); page.tsx → ResponsiveEditorEntry
  api/health/          public Docker healthcheck — the only unauthenticated route
  api/load-captions/   SSO-wrapped, reads the mounted captions directory
  api/load-shared/     SSO-wrapped, reads shared uploads from a sibling stack
  best-practices/      public static page
  offline/             PWA offline fallback
  globals.css          Tailwind v4 theme, Radix token mapping
  layout.tsx           root layout: fonts, ThemeProvider, Toaster, PWA meta
  robots.ts, sitemap.ts
components/
  ui/                  shadcn primitives — read-only (see Do not touch)
  editor/              editor-app.tsx, responsive-editor-entry.tsx, viewport.ts
  subtitle/            list, items, text editor, time fields, track tabs
  app-header/  bulk-offset/  find-replace/  waveform-visualizer/
  video-player.tsx     wavesurfer-backed player
context/subtitle/      global state — see state-and-persistence.md
hooks/                 one concern per hook; effects live here, not in components
lib/                   pure logic: parsing, timing, session, peaks cache, sso, safe-path
messages/              13 locale catalogs
tests/                 mirrors lib/ and component concerns — see testing.md
types/                 subtitle.ts, mp4box.d.ts
docs/agents/           this documentation set
```

## Request flow

1. `proxy.ts` runs as middleware with matcher `/((?!_next|api|.*\..*).*)`. For locale routes and `/`, it verifies the SSO cookie (`lib/sso.ts`) and then hands off to the next-intl middleware (`localePrefix: "as-needed"`, `localeDetection: false`). Everything else — `/api/*`, static pages, any path with a dot — passes through untouched.
2. `app/[locale]/page.tsx` is a server component that resolves translations server-side and renders `ResponsiveEditorEntry` (client).
3. API routes are outside the middleware matcher, so each one authenticates itself via `withApiAuth()` — see [security.md](security.md).

## Key files

| File                               | Purpose                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `components/editor/editor-app.tsx` | Main editor client component                                            |
| `context/subtitle/provider.tsx`    | Wires all six contexts together                                         |
| `proxy.ts`                         | SSO + locale middleware                                                 |
| `lib/sso.ts`                       | Cookie verification, `withApiAuth`                                      |
| `lib/safe-path.ts`                 | Path traversal guard for API file reads                                 |
| `lib/local-session.ts`             | Autosave/restore snapshot                                               |
| `lib/waveform-peaks-cache.ts`      | IndexedDB peaks cache                                                   |
| `lib/locales.ts`                   | Locale list + validation                                                |
| `lib/utils.ts`                     | `cn()`, `timeToSeconds`, `secondsToTime`, `isValidTime`, `escapeRegExp` |
| `types/subtitle.ts`                | `Subtitle`, `SubtitleTrack`                                             |
| `next.config.ts`                   | PWA, i18n plugin, standalone output, CSP, React Compiler                |

## Do not touch

- `.next/` — build output
- `node_modules/` — dependencies
- `public/sw.js`, `public/workbox-*.js`, `public/fallback-*.js` — emitted by next-pwa at build time, git-ignored
- `tsconfig.tsbuildinfo` — incremental build cache
- `components/ui/` base primitives — these are shadcn scaffolding; wrap or extend with cva instead of editing them
- `tests/fixtures/` — fixture data (also excluded from ESLint and Biome)
- `messages/*.json` — do not hand-edit keys ad hoc; add keys consistently across all locales (see [frontend-conventions.md](frontend-conventions.md))

`public/_headers` is a Cloudflare-Pages artifact and is unused here — leave it alone.
