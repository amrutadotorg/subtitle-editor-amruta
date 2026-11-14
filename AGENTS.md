# subtitle-editor

Browser-based SRT/VTT subtitle editor: multi-track editing, waveform visualization, 13 locales — Next.js 16 PWA, deployed with Docker behind nginx.

This file is the entry point. Read it fully; open a linked file only when your task touches that area.

## Ground rules

- **Package manager: npm.** `package-lock.json` is authoritative — use `npm ci`, never yarn/pnpm.
- **Node 26** (`.nvmrc` → `26.13.1`). Run `nvm use` before anything else.
- **Local env:** `.env.local` must contain `SSO_SALT` (HMAC secret for the SSO cookie). Nothing else is required.

## Commands

| Command                | What it really is                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Next dev **with Turbopack**                                                                          |
| `npm run build`        | **`next build --webpack`** — deliberate, do not "modernise" it ([why](docs/agents/build-and-pwa.md)) |
| `npm run test`         | `tsx --test tests/**/*.test.ts` — Node test runner, not Jest/Vitest                                  |
| `npm run lint`         | ESLint with `--max-warnings=0`                                                                       |
| `npm run format`       | Biome **formatter only** — ESLint owns linting                                                       |
| `npm run format:check` | Same check CI runs (no writes)                                                                       |
| `npm run knip`         | Unused files, exports, dependencies                                                                  |

## Before you call a change done

Every change, no exceptions — CI runs the same steps in the same order:

```bash
npm run format        # only if you touched formatting; then:
npm run lint && npm run format:check && npm run test && npm run knip && npm run build
```

`npm run build` is mandatory, not "for UI changes only" — it type-checks Next's generated route types, which `tsc` never sees. Details and CI parity: [local-workflow.md](docs/agents/local-workflow.md).

## Invariants

- Every `app/api/**/route.ts` is wrapped in `withApiAuth()` from `@/lib/sso` — **except `app/api/health/route.ts`**, which must stay public for the Docker healthcheck. `tests/api-guardrail.test.ts` enforces this.
- Any filesystem path derived from request input goes through `resolveSafePath()` from `@/lib/safe-path`.
- Never edit or commit generated state: `.next/`, `public/sw.js`, `public/workbox-*.js`, `public/fallback-*.js`, `tsconfig.tsbuildinfo`. Full list: [architecture.md § Do not touch](docs/agents/architecture.md#do-not-touch).
- Keep `reactCompiler: true` in `next.config.ts` and `connect-src 'self' blob:` in the CSP — removing the latter silently breaks waveform rendering.

## Where to look next

| Task touches…                                       | Read                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| Repo layout, key files, request flow                | [architecture.md](docs/agents/architecture.md)                   |
| React/TS conventions, naming, imports, i18n, shadcn | [frontend-conventions.md](docs/agents/frontend-conventions.md)   |
| Contexts, undo/redo, autosave, IndexedDB caches     | [state-and-persistence.md](docs/agents/state-and-persistence.md) |
| SSO, API auth, path traversal, CSP, public pages    | [security.md](docs/agents/security.md)                           |
| Tests, fixtures, guardrail suites                   | [testing.md](docs/agents/testing.md)                             |
| Env, scripts, ESLint/Biome split, CI                | [local-workflow.md](docs/agents/local-workflow.md)               |
| Webpack build, service worker, nginx caching        | [build-and-pwa.md](docs/agents/build-and-pwa.md)                 |
| Docker dev/prod, deploy, nginx reload, CF purge     | [deployment.md](docs/agents/deployment.md)                       |
| Dependabot, Node pins, DIUN, npm audit, overrides   | [dependencies.md](docs/agents/dependencies.md)                   |
| Branching, commits, PRs                             | [git-workflow.md](docs/agents/git-workflow.md)                   |
| Known quirks and stale artifacts                    | [known-issues.md](docs/agents/known-issues.md)                   |

Infrastructure that is shared with other stacks (compose project layout, nginx upstream pinning, DIUN defaults) is documented in `~/containers/AGENTS.md` — that file wins for cross-stack rules.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
