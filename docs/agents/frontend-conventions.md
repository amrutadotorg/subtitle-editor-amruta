# Frontend conventions

## Language and components

- TypeScript strict. No `.js`/`.jsx` files anywhere in `app/`, `components/`, `lib/`, `hooks/`.
- Functional components only. Mark client components with `"use client"` as the first statement.
- Keep `useEffect` logic out of components: extract it into a dedicated hook in `hooks/` (`use-waveform-peaks.ts`, `use-resume-cursor.ts`, …).
- Avoid `any`. When consuming an untyped library, add a declaration file under `types/` (pattern: `types/mp4box.d.ts`).

## Naming and exports

| Kind           | Convention                          | Example                                                      |
| -------------- | ----------------------------------- | ------------------------------------------------------------ |
| File           | kebab-case                          | `subtitle-list.tsx`, `use-playback-state.ts`                 |
| Component      | PascalCase, default export          | `export default function SubtitleList()`                     |
| Hook / utility | camelCase named export              | `export function usePlaybackState()`, `export function cn()` |
| Type           | PascalCase in `types/` or colocated | `Subtitle`, `SubtitleTrack`                                  |

Pages and most components: default export. Hooks and utilities: named exports. The `context/subtitle/index.tsx` barrel is the exception on both counts — import contexts from there.

## Imports

Use the `@/` alias for everything in-repo. Group imports in this order (a convention, not enforced by tooling — Biome does not sort imports, and ESLint has no `import/order` rule, so review it yourself):

```tsx
// 1. External libraries
import { useTranslations } from "next-intl";
// 2. In-repo, via @/ alias
import { AppHeader } from "@/components/app-header";
import { useSubtitleState } from "@/context/subtitle";
import { cn } from "@/lib/utils";
// 3. Types
import type { Subtitle } from "@/types/subtitle";
// 4. React
import { useEffect, useRef, useState } from "react";
```

## Styling

- Tailwind utility classes only. No CSS modules, no styled-components.
- Conditional classes go through `cn()` from `@/lib/utils`.
- Theme colors come from Radix CSS variables defined in `app/globals.css`; prefer those tokens over hard-coded hex values. If a one-off color is genuinely needed, add a CSS token rather than scattering arbitrary values.
- There is no `tailwind.config.ts` — Tailwind 4 is configured in CSS. Do not create one (see [known-issues.md](known-issues.md)).

## shadcn/ui

Primitives in `components/ui/` are scaffolding: extend via `cva` variants in a wrapper component or a domain component; do not edit the base files. Domain-specific styling belongs in `components/<feature>/`, following the existing `controls.tsx` / `drawer.tsx` splits.

## i18n

- All user-facing strings go through `useTranslations()` (client) or `getTranslations()` (server components). No literal UI text.
- Keys live in `messages/<locale>.json`; `en.json` is the source of truth. Every key must exist in all 13 locales — `tests/locale-parity.test.ts` fails otherwise.
- Locale list and validation: `lib/locales.ts`. Adding a locale means extending that array, adding the catalog, and translating the keys surfaced by the editor route.
- Fallback is handled by deep-merging onto English in `i18n/`; a missing key in a non-English catalog is still a test failure, not a silent fallback.

## Component shape

Match an existing sibling rather than inventing structure — `components/subtitle/` and `components/app-header/` are the reference implementations. Do not copy the illustrative snippet that used to live in `AGENTS.md`; it is not a real file.
