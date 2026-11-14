# Testing

## Runner

`npm run test` → `tsx --test tests/**/*.test.ts`. Node's built-in test runner (`node:test` + `node:assert`), executed through `tsx` so TypeScript test files need no build step. There is no Jest or Vitest in this repo — do not introduce one.

```bash
npm run test                                  # whole suite
npx tsx --test tests/locales.test.ts          # one file
```

## Layout

- Tests live in `tests/`, flat, named `<subject>.test.ts`. They mirror the concern they cover, not necessarily one file per source file: `lib/locales.ts` → `tests/locales.test.ts`, several `lib/subtitle-*.ts` modules → `tests/subtitle-metrics.test.ts` etc.
- `tests/helpers/` — `render.ts` (Testing Library + next-intl provider wrapper), `locale-keys.ts` (catalog helpers), `jsdom.d.ts` (ambient types).
- `tests/fixtures/` — real subtitle files (`.vtt`) for parser edge cases. Excluded from ESLint and Biome; do not reformat them.

## React component tests

Use Testing Library with jsdom via the helpers in `tests/helpers/`. Component tests in this suite assert rendering and interaction (`tests/subtitle-item-focus.test.ts`, `tests/narrow-screen-notice.test.ts`), not snapshots.

## Guardrail tests — do not weaken

| Test                          | What it protects                                                          |
| ----------------------------- | ------------------------------------------------------------------------- |
| `tests/api-guardrail.test.ts` | Every `app/api/**/route.ts` uses `withApiAuth`, except the `health` route |
| `tests/locale-parity.test.ts` | Every message key exists in all 13 catalogs                               |
| `tests/safe-path.test.ts`     | Path traversal rejection in `resolveSafePath`                             |
| `tests/sso.test.ts`           | Cookie verification outcomes                                              |

If one of these fails, the fix is almost always in the source, not in the test. Loosening a guardrail requires an explicit decision (and, for the health route, it is already encoded).

## Pure logic first

Business logic belongs in `lib/` as pure functions so it can be tested without a DOM (`subtitle-ordering`, `bulk-shift`, `find-replace-helpers`, `waveform-peaks-cache`). If you find yourself needing heavy mocking to test a component, that is a signal to extract the logic into `lib/` or a hook first.
