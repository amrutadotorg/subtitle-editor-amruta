# Build and PWA

## `npm run build` is `next build --webpack` — deliberately

Next 16 builds with Turbopack by default, but `@ducanh2912/next-pwa` hooks the **webpack** build only. Under Turbopack no `public/sw.js` was emitted, `/sw.js` returned 404, and the client kept trying to register it — silent loss of offline mode. Fixed 2026-10-31 by pinning the build to webpack.

Consequences to respect:

- Do not "clean up" the `--webpack` flag. If build time becomes a problem, the answer is migrating to `@serwist/next` (Turbopack-capable), not dropping the flag — see `docs/serwist-migration-plan.md`.
- `npm run dev` stays on Turbopack. The PWA plugin is disabled in development anyway (`disable: process.env.NODE_ENV === "development"`).
- Because the webpack build type-checks Next's generated route types, a route file may only export HTTP handlers plus `config`/`dynamic`/similar. Extra exports fail the build.

## Generated artifacts

`public/sw.js`, `public/workbox-*.js` and `public/fallback-*.js` are produced at build time and git-ignored. Never commit them, never hand-edit them.

`next.config.ts` sets `output: "standalone"`; `Dockerfile.prod` copies `.next/standalone`, `.next/static` and `public` into the runner stage.

## PWA configuration

```ts
withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: false,
  fallbacks: { document: "/offline" },
  workboxOptions: {
    exclude: [/middleware-manifest\.json$/],
    skipWaiting: true,
  },
});
```

`app/offline/page.tsx` is the offline fallback document.

## Caching rules at the edge

nginx serves `/sw.js`, `/workbox-*.js` and `/manifest.json` with `no-cache, no-store, must-revalidate` so a new worker is picked up on the next load. Config: `~/containers/nginx/sites/subtitle-editor.amruta.org.conf`.

Static assets under `/_next/static` get a one-year immutable cache — the hashed filenames make that safe.

`public/_headers` is a Cloudflare-Pages artifact and is unused in this deployment. Do not add rules there expecting them to apply.

## After deploying

If the service worker changed, users see the old worker until a hard refresh (`Ctrl+Shift+R`). This is expected; say so in deploy notes rather than chasing a cache bug.
