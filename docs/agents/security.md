# Security

## SSO middleware (`proxy.ts`)

Matcher: `/((?!_next|api|.*\..*).*)`.

| Path                                               | SSO                   | next-intl |
| -------------------------------------------------- | --------------------- | --------- |
| `/`, `/en/…`, `/de/…` (any locale)                 | yes                   | yes       |
| `/api/*`                                           | no — see below        | no        |
| `/best-practices`, `/offline`, any path with a dot | no (public by design) | no        |

`verifySso()` in `lib/sso.ts` validates the HMAC-signed cookie against `SSO_SALT` and redirects on failure.

## API routes

**Rule:** every `app/api/**/route.ts` is wrapped with `withApiAuth()` from `@/lib/sso`.

**The single exception is `app/api/health/route.ts`**, which must stay public — `Dockerfile.prod` runs a `HEALTHCHECK` against `/api/health`, and an authenticated healthcheck would report the container unhealthy. `tests/api-guardrail.test.ts` encodes this rule and skips only that path. Adding a new unauthenticated route means updating that test deliberately, not silently.

`withApiAuth` returns JSON errors: `401` for an invalid signature, `500` for a missing/broken `SSO_SALT`. Do not leak which of the two happened into client UI copy.

## Filesystem reads

Any path built from request input must pass through `resolveSafePath(baseDir, fileName)` from `@/lib/safe-path`. It returns the resolved absolute path, or `null` when the result would escape `baseDir`. Treat `null` as a 400/404 — never fall back to the unvalidated input.

Directories currently mounted read-only into the container:

- `/app/captions` — local captions (`load-captions`)
- `/app/shared_uploads` — sibling `subtitle-translator-sqlpage` uploads (`load-shared`)

## Headers and CSP (`next.config.ts`)

- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- CSP is defined inline in `next.config.ts`.
- **`connect-src` must keep `blob:`.** WaveSurfer `fetch`es the local media object URL to decode peaks for files below the 100 MB extraction threshold. Removing it does not error — the waveform spinner hangs and then renders blank.
- `img-src` and `media-src` also allow `blob:` and `data:`; `worker-src` allows `blob:`.

## Adding a public static page

1. Create `app/<page-name>/page.tsx`.
2. Add it to `app/sitemap.ts`.
3. Done — `proxy.ts` needs no change; only locale routes and `/` are gated.

## Secrets

`SSO_SALT` lives in `.env.local`, which is also the `env_file` for the production container. Never commit a real value; `.env.local.example` documents the shape.
