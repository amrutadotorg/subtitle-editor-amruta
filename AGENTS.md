# Project Context & Rules for AI Agents

## Overview

A browser-based subtitle editor (SRT/VTT) with multi-track support, audio waveform visualization, Vimeo integration, and i18n (en, de, pl, yue). Built as a Next.js PWA with React 19 and deployed via Docker.

## Tech Stack

| Category | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack dev, standalone output) |
| UI Library | React 19.2, React DOM 19.2, React Compiler enabled (`reactCompiler: true` in next.config) |
| Language | TypeScript 6 (strict mode) |
| Styling | Tailwind CSS 4 + `tailwindcss-animate`, Radix UI Colors, class-variance-authority (cva), clsx + tailwind-merge |
| Component Library | shadcn/ui (New York style, Radix primitives) |
| Icons | @tabler/icons-react |
| State Management | React Context (6 contexts in subtitle-context.tsx), custom hooks, useReducer via `use-undoable-state` |
| i18n | next-intl (4 locales: en, de, pl, yue), deep-merged fallback to English |
| Animation | motion (Framer Motion successor) |
| Video/Audio | wavesurfer.js 7 + @wavesurfer/react, mp4box for MP4 parsing |
| Testing | Node test runner (`tsx --test`), @testing-library/react, jsdom |
| Linting | ESLint 9 (eslint-config-next/core-web-vitals), Biome 2 (formatter only, linter disabled) |
| PWA | @ducanh2912/next-pwa (service worker, offline fallback) |
| Runtime | Node.js 24 (.nvmrc) |
| Docker | docker-compose with dev and prod profiles |

## Directory Structure

```
├── app/                    # Next.js App Router pages and API routes
│   ├── [locale]/           # i18n-routed pages (page.tsx, layout.tsx)
│   ├── api/                # API routes (vimeo/download, load-shared, load-captions)
│   ├── faq/                # Static FAQ page
│   ├── offline/            # PWA offline fallback page
│   ├── globals.css         # Global styles, Tailwind config, Radix color mappings, CSS variables
│   ├── layout.tsx          # Root layout (ThemeProvider, Toaster, fonts, PWA meta)
│   ├── robots.ts           # SEO robots
│   └── sitemap.ts          # SEO sitemap
├── components/             # React components
│   ├── ui/                 # shadcn/ui base components (button, dialog, input, tabs, etc.)
│   ├── editor/             # Core editor: editor-app.tsx, responsive-editor-entry.tsx, viewport.ts
│   ├── subtitle/           # Subtitle list, items, text editor, time fields, track tabs
│   ├── app-header/         # App header with settings dialog
│   ├── bulk-offset/        # Bulk timing offset controls
│   ├── find-replace/       # Find & replace panel
│   ├── waveform-visualizer/ # Waveform display and region handling
│   ├── theme-provider.tsx  # next-themes ThemeProvider wrapper
│   ├── video-player.tsx    # Video player (wavesurfer-backed)
│   ├── vimeo-loader.tsx    # Vimeo video loader
│   ├── logo.tsx            # SVG brand mark
│   └── ...                 # Various utility UI components
├── context/                # React Context providers
│   ├── subtitle-context.tsx # Main state: tracks, undo/redo, local session, settings (6 contexts)
│   └── subtitle-navigation-context.tsx
├── hooks/                  # Custom React hooks (use-subtitle-actions, use-undoable-state, etc.)
├── lib/                    # Pure utility functions and business logic
│   ├── utils.ts            # cn(), timeToSeconds, secondsToTime, isValidTime, escapeRegExp
│   ├── subtitle-*.ts       # Subtitle parsing, operations, ordering, metrics, playback, history
│   ├── local-session.ts    # LocalStorage session autosave/restore
│   ├── file-utils.ts       # File type detection
│   ├── locales.ts          # Locale definitions and validator
│   └── ...                 # Format, logging, media support, etc.
├── types/                  # TypeScript type definitions
│   └── subtitle.ts         # Subtitle, SubtitleTrack interfaces
├── tests/                  # Unit tests (mirrors lib/ and components/ structure)
│   ├── helpers/            # Test utilities (renderWithIntl, jsdom setup)
│   └── fixtures/           # Test fixture files (gitignored by biome/eslint)
├── i18n/                   # next-intl request config (deep-merge fallback to en)
├── messages/               # Locale JSON files (en.json, de.json, pl.json, yue.json)
├── public/                 # Static assets (favicon, icons, manifest, og-image)
├── scripts/                # Build/utility scripts (scripts/icon/)
└── docs/                   # Documentation (docs/superpowers/)
```

## Commands

### Development
```bash
npm run dev          # Start Next.js dev server with Turbopack
```

### Build & Production
```bash
npm run build        # Production build (Next.js standalone output)
npm run start        # Start production server
```

### Code Quality
```bash
npm run lint         # ESLint with max-warnings=0 (zero tolerance)
npm run format       # Biome auto-format entire codebase
npm run format:check # Biome format check only (no auto-fix, no lint)
npm run knip         # Detect unused files, exports, dependencies, and types
```

### Testing
```bash
npm run test         # Run all unit tests via Node test runner (tsx --test tests/**/*.test.ts)
```

### Docker
```bash
docker compose --profile dev up    # Dev server on port 3000 (hot reload, source mounted)
docker compose --profile prod up   # Prod server on port 3001 (built image)
```

### Docker Deployment (Production)
```bash
# Production compose file is at ~/containers/compose.yml (NOT in this repo)
cd ~/containers
docker compose build subtitle_editor   # Build production image
docker compose up -d subtitle_editor   # Deploy (recreate container)
docker restart nginx subtitle_editor   # Reload nginx proxy
uv run --project ~/SCRIPTS/py_amr -m waf.purge_cache --host subtitle-editor.amruta.org  # Purge CF cache
```

The image is `subtitle-editor:prod`. After deploying, users must hard-refresh (Ctrl+Shift+R) to see changes if the service worker was updated.

## Dependency Updates (Dependabot)

Dependabot is configured via `.github/dependabot.yml` with two ecosystems:

- **npm** — weekly PRs grouped by patch/minor (major gets separate PR)
- **docker** — weekly PRs for base image updates (`node:24-alpine`)

### Deployment workflow after Dependabot PR merge

```bash
# 1. Pull latest main (with merged Dependabot PR)
git pull origin main

# 2. Reinstall dependencies (matches what Dockerfile.prod does)
nvm use && npm ci

# 3. Rebuild Docker image
docker compose build subtitle_editor

# 4. Deploy
docker compose up -d subtitle_editor
docker restart nginx subtitle_editor

# 5. Purge Cloudflare cache
uv run --project ~/SCRIPTS/py_amr -m waf.purge_cache --host subtitle-editor.amruta.org
```

CI runs lint, test, build, **and** `docker build` on every Dependabot PR — green CI means the update is safe to merge. After merge, the steps above deploy the updated image.

## Verification Workflow

Before considering any change complete, an agent **must** run:

```bash
npm run lint            # 1. ESLint — must pass with zero warnings
npm run format          # 2. Biome format — auto-fix formatting
npm run format:check    # 3. Biome format verify — must exit clean
npm run test            # 4. All unit tests must pass
npm run knip            # 5. No unused files, exports, or dependencies
```

For UI-impacting changes, also run:
```bash
npm run build           # 6. Production build must succeed (catches type errors, missing exports)
```

**Do NOT skip any step.** ESLint has `--max-warnings=0`, so any warning is a failure.

## Environment Setup

- **Node.js 24** (required; `.nvmrc` specifies version)
- **`.env.local`** contains:
  - `VIMEO_ACCESS_TOKEN` — Vimeo API access token for video import
  - `SSO_SALT` — HMAC secret for SSO cookie verification
- **`.dev.vars`** — Cloudflare Workers local dev bindings (NEXTJS_ENV, SSO_SALT)
- No other env vars required for local dev; the app runs fully client-side after SSO verification

## Coding Guidelines & Best Practices

### Component Conventions
- **TypeScript throughout** — strict mode enabled, no `.js`/`.jsx` files
- **Functional components only** — no class components
- **Client components** marked with `"use client"` at top of file
- **Path aliases** — use `@/` for all imports (e.g., `@/components/...`, `@/lib/...`, `@/hooks/...`)
- **Naming**: kebab-case for files (`subtitle-list.tsx`, `use-playback-state.ts`), PascalCase for components, camelCase for hooks and utilities
- **Default exports** for pages and most components; named exports for hooks and utilities
- **shadcn/ui components** in `components/ui/` — extend via cva, do not modify base primitives
- **CSS**: Tailwind utility classes only; use `cn()` helper for conditional classes; Radix color tokens via CSS variables
- **i18n**: Use `useTranslations()` from next-intl for all user-facing strings; keys live in `messages/*.json`

### State Management
- Global state via **split React Contexts** in `subtitle-context.tsx` (6 contexts for granular re-renders)
- **Undo/redo** via custom `useUndoableState` hook with per-track history
- **Local session** persistence via localStorage (autosave with 750ms debounce)
- **Settings** persisted independently from session state

### Representative Code Pattern

```tsx
"use client";

import { IconKeyboard } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

export default function BottomInstructions() {
  const t = useTranslations();

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 items-start h-full text-foreground px-4 md:px-8 py-4 border-t-2 border-black dark:border-white">
      <div className="text-base md:text-lg text-foreground p-2">
        <p className="">{t("instructions.afterLoading")}</p>
        <ul className="list-disc list-inside my-2">
          <li>{t("instructions.editText")}</li>
          <li>{t("instructions.icons")}</li>
        </ul>
      </div>
      <div className="p-2">
        <h2 className="text-base md:text-lg inline-flex items-center text-foreground">
          <IconKeyboard className="mr-2" />
          {t("shortcuts.title")}
        </h2>
      </div>
    </div>
  );
}
```

### Import Order Convention
```tsx
// 1. External libraries
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
// 2. Internal components/hooks/lib (all via @/ alias)
import { AppHeader } from "@/components/app-header";
import { useSubtitleState } from "@/context/subtitle-context";
import { cn } from "@/lib/utils";
// 3. Types
import type { Subtitle } from "@/types/subtitle";
// 4. React
import { useEffect, useRef, useState } from "react";
```

## Known Issues / Work in Progress

- **No TODO/FIXME/HACK comments found** — codebase is clean of tracked in-progress markers
- **`scratch.js`** in project root — ad-hoc MP4 debugging script, not part of the build; safe to ignore
- **`components.json`** references `tailwind.config.ts` which does not exist (Tailwind v4 uses CSS-based config in `globals.css`); this is a stale shadcn/ui config artifact — do not create a `tailwind.config.ts`
- **React Compiler** is enabled (`reactCompiler: true`) — this is intentional and must remain enabled
- **ESLint rule `react-hooks/set-state-in-effect`** is disabled for 10 specific files (legitimate pattern for autosave); do not re-enable without understanding the autosave architecture
- **`fast-xml-parser`** is pinned in overrides to 5.7.1 — do not upgrade

## Git Workflow

- **`main`** is the sole long-lived branch; all work lands here.
- CI runs on every push and PR to `main` via `.github/workflows/ci.yml`.
- Before opening a PR, run the full [Verification Workflow](#verification-workflow) locally.
- Keep commits atomic: one logical change per commit.
- Do not force-push to `main` or rewrite published history.
- Use `git add -A` cautiously — review `git status` before staging.

### CI Pipeline (`.github/workflows/ci.yml`)

Triggers on push/PR to `main`. Steps, in order:

1. `npm run lint` — ESLint (zero warnings)
2. `npm run format` — Biome auto-format
3. `npm run format:check` — Biome format verification
4. `npm run test` — Node test runner
5. `npm run knip` — Unused code detection
6. `npm run build` — Next.js production build

All steps must pass. A failure in any step blocks the merge.

## Do Not Touch

- **`.next/`** — Next.js build output (auto-generated)
- **`node_modules/`** — dependencies
- **`public/sw.js`**, **`public/workbox-*.js`**, **`public/fallback-*.js`** — PWA service worker files auto-generated by next-pwa at build time
- **`tsconfig.tsbuildinfo`** — TypeScript incremental build cache
- **`messages/*.json`** — locale files; add keys via the i18n pipeline, not arbitrary edits
- **`components/ui/`** base primitives — these are shadcn/ui scaffolding; extend via wrapper components, not by editing the base files
- **`.wrangler/`** — Cloudflare Workers local state
- **`tests/fixtures/`** — test fixture data

## Nginx Configuration

- **Config file**: `~/containers/nginx/sites/subtitle-editor.amruta.org.conf`
- **Reload nginx**: `docker restart nginx`

## Key Files

| File | Purpose |
|---|---|
| `app/layout.tsx` | Root layout: fonts, ThemeProvider, Toaster, PWA meta, SEO |
| `app/[locale]/layout.tsx` | Locale layout: i18n provider, metadata per locale |
| `app/[locale]/page.tsx` | Main page entry (server component → ResponsiveEditorEntry) |
| `app/globals.css` | Tailwind v4 config, Radix color mappings, CSS custom properties |
| `next.config.ts` | Next.js config: PWA, i18n plugin, standalone output, React Compiler |
| `proxy.ts` | Middleware: SSO verification + next-intl locale routing |
| `context/subtitle-context.tsx` | Core state management (6 contexts, undo/redo, local session) |
| `components/editor/editor-app.tsx` | Main editor client component |
| `lib/locales.ts` | Locale definitions and validation |
| `lib/utils.ts` | cn(), time formatting utilities |
| `types/subtitle.ts` | Subtitle and SubtitleTrack interfaces |
| `tsconfig.json` | TypeScript config (strict, path aliases, bundler resolution) |
| `biome.json` | Biome formatter config (space indent, width 2) |
| `eslint.config.js` | ESLint config (core-web-vitals, file-specific rule overrides) |
