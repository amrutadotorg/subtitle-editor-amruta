# Local workflow

## Setup

```bash
nvm use              # Node 26 from .nvmrc (currently 26.13.1)
npm ci               # not `npm install` — lockfile is authoritative
```

`.env.local` needs exactly one variable: `SSO_SALT` (HMAC secret for the SSO cookie). `.env.local.example` shows the shape. Without it the app runs but SSO verification returns `500`.

## Scripts

| Script         | Command behind it                                                                        |
| -------------- | ---------------------------------------------------------------------------------------- |
| `dev`          | `next dev --turbopack`                                                                   |
| `build`        | `next build --webpack` (see [build-and-pwa.md](build-and-pwa.md))                        |
| `start`        | `next start` — only meaningful after `build`, and normally superseded by the Docker path |
| `lint`         | `eslint --max-warnings=0 .`                                                              |
| `format`       | `biome format --write .`                                                                 |
| `format:check` | `biome check --linter-enabled=false --formatter-enabled=true .`                          |
| `test`         | `tsx --test tests/**/*.test.ts`                                                          |
| `knip`         | `knip`                                                                                   |

## Verification order (mandatory)

```bash
npm run format          # only if you changed formatting
npm run lint            # ESLint, zero warnings tolerated
npm run format:check    # Biome, verify only
npm run test
npm run knip
npm run build           # always, not just for UI changes
```

Why each one earns its place:

- **lint** — `--max-warnings=0`, so a warning is a failure. Core Web Vitals rules plus the project overrides.
- **format:check** — a different tool from ESLint. Biome formats; it does not lint (`linter-enabled=false`). Passing ESLint does not imply passing this, and vice versa.
- **test** — the guardrail suites (`api-guardrail`, `locale-parity`, `safe-path`, `sso`) fail fast here.
- **knip** — unused files, exports, dependencies and types. Deleting a component without removing its exports will fail here.
- **build** — `next build` type-checks Next's generated route types, which `tsc --noEmit` never sees. A route file that exports anything other than HTTP handlers (plus `config`/`dynamic`) fails only at build time.

## ESLint vs Biome

Two tools, disjoint jobs:

- **ESLint** (`eslint.config.js`) owns linting: `eslint-config-next/core-web-vitals` plus overrides.
- **Biome** (`biome.json`) is the formatter only: space indent, width 2.

Ignored by ESLint: `.next/`, `.vercel/`, `node_modules/`, `public/`, `tests/fixtures/`, `next-env.d.ts`, `eslint.config.js`.

`react-hooks/set-state-in-effect` is turned off for a fixed enumerated list of files in `eslint.config.js` — autosave/restore paths and hook-wiring files where the pattern is legitimate. Do not re-enable it globally, and do not add a file to that list unless it genuinely follows the same autosave/restore shape.

## knip

`knip.json` ignores `scripts/icon/render.mjs` (invoked manually, not imported). When knip flags something, prefer deleting the dead export over adding an ignore.

## CI parity

`.github/workflows/ci.yml` runs on every push/PR to `main`:

1. `npm ci` (Node version resolved from `.nvmrc` via `node-version-file`)
2. `npm run lint`
3. `npm run format:check`
4. `npm run test`
5. `npm run knip`
6. `npm run build`
7. `docker build -t subtitle-editor:ci -f Dockerfile.prod .`

A failure in any step blocks the merge. Running the local list above is equivalent — plus the Docker build, which is worth doing when you touch `Dockerfile.prod`, `next.config.ts` or dependencies.
