# Dependencies and runtime

## Dependabot

`.github/dependabot.yml` — **monthly**, two ecosystems:

| Ecosystem | Grouping                                                             |
| --------- | -------------------------------------------------------------------- |
| `npm`     | separate `patch` and `minor` groups; majors arrive as individual PRs |
| `docker`  | one `docker` group, all patterns                                     |

Open PR limit: 10.

CI runs lint, format:check, test, knip, build **and** `docker build` on every Dependabot PR, so green CI means the update is safe to merge. After merging, deploy with the recipe in [deployment.md](deployment.md) (which includes `nvm use && npm ci` before rebuilding).

## Node pins — they move together

CI resolves its Node version from `.nvmrc`, so a mismatch elsewhere surfaces later as a confusing failure.

| File                            | Holds                                         | Changes on                              |
| ------------------------------- | --------------------------------------------- | --------------------------------------- |
| `.nvmrc`                        | `26.13.1` (also CI's `node-version-file`)     | every bump                              |
| `package.json` → `engines.node` | `>=26`                                        | major only                              |
| `Dockerfile.prod`               | `FROM node:26.13.1-alpine` in **both** stages | every bump                              |
| `Dockerfile.dev`                | `FROM node:26.13.1-alpine`                    | every bump                              |
| `package.json` → `@types/node`  | `^26.6.6`                                     | major only (patch/minor via Dependabot) |
| `Dockerfile.prod` builder       | `RUN npm install -g npm@12`                   | only if bundled npm must be overridden  |

npm is pinned **floating** (`npm@12`) and only in the builder stage; the runtime uses the npm bundled in the base image. That asymmetry is intentional — the line affects the build, not production.

## Two update signals, two different actions

**Dependabot `docker` PR** — the tag _string_ in the Dockerfiles changed (e.g. `26.13.0-alpine` → `26.14.0-alpine`). Merge, then deploy.

**DIUN notification for `node:26-alpine`** — only the _digest_ of the floating tag changed. It fires both for a new Node release and for an upstream rebuild of the same version (Alpine patch, bundled npm). Check which:

```bash
curl -s "https://hub.docker.com/v2/repositories/library/node/tags?page_size=100&name=26." \
  | python3 -c "import sys,json;print('\n'.join(t['name'] for t in json.load(sys.stdin)['results']))"
```

- **Newer version exists** → bump the pins above, merge, deploy.
- **Same version** → no file changes, nothing to commit. Rebuild with `--pull` so the image picks up the refreshed base, then deploy.

## Node major upgrade (e.g. 26 → 28)

Same pins, plus one file **outside this repo**: DIUN watches the floating tag, so `~/containers/diun/custom-images.yml` must follow, otherwise DIUN keeps watching an EOL tag and silently stops reporting.

```bash
cd ~/containers/diun && git pull
sed -i 's/node:26-alpine/node:28-alpine/' custom-images.yml
git commit -am 'chore: watch node:28-alpine' && git push
cd ~/containers && docker compose up -d diun
```

Patch/minor bumps never touch `custom-images.yml`.

## npm audit status

Do **not** run `npm audit fix --force`. Every offer it makes for the entries below is a breaking downgrade.

| Item                                                                 | Status                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepmerge` → workbox-build → next-pwa, 5 lows (GHSA-gcqx-w48m-w2h4) | **Accepted** 2026-10-28. No patched version; upstream declined. Build-time only (Workbox generates the SW during `next build`), merge inputs are local plugin options, no untrusted data path. Revisit if a release > 4.3.1 appears or the advisory is withdrawn. |
| `braces` chain (GHSA-vfj7-8cjw-p6xm)                                 | **Resolved** by advisory withdrawal 2026-10-23, not by a version bump. No patched `braces` exists.                                                                                                                                                                |
| `minimatch` DoS (GHSA-g3hv-75wg-m249)                                | **Resolved** via `overrides.minimatch` `^11.0.3`. Verified with a full webpack build (SW emitted), `eslint --max-warnings=0` and the test suite.                                                                                                                  |
| `sharp` librsvg UAF (GHSA-wq5f-xc86-pv6w)                            | **Resolved** via `overrides.sharp` `0.35.5`. Warranted because Next Image Optimization can process untrusted images in production.                                                                                                                                |

When accepting a new risk, add a row here with the date, the score, why it is unreachable, and the condition that would make you revisit it.

## Overrides that must not be casually changed

`package.json` → `overrides` carries security and compatibility pins. Notable ones:

- **`fast-xml-parser: 5.7.1`** — pinned deliberately. Do not upgrade without testing the subtitle parsers end to end.
- `sharp`, `minimatch`, `brace-expansion`, `flatted`, `micromatch.picomatch`, `serialize-javascript`, `ejs`, `undici`, `fast-uri`, `zod`, `postcss` — raised to patched/consistent versions.

Changing any override requires `npm install`, a clean `npm audit` comparison, the full verification workflow, and a production build.
