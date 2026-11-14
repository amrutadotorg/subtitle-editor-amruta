# Deployment

Cross-stack rules (the single compose project, nginx upstream pinning, DIUN defaults) live in `~/containers/AGENTS.md`. This file covers only what is specific to `subtitle_editor`.

## The two compose files in this repo

| File                      | Status                                                      | Use                                                                   |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `docker-compose-dev.yml`  | self-contained (no `my_network` reference)                  | local dev/prod smoke tests                                            |
| `docker-compose.prod.yml` | **fragment** — image, membership in `my_network`, pinned IP | never run standalone; it is `include:`d by `~/containers/compose.yml` |

Running `docker compose -f docker-compose.prod.yml up` creates a separate project without the `my_network` definition and fails (or strands the container on the wrong network). Production is always driven from `~/containers`.

## Local Docker

```bash
docker compose -f docker-compose-dev.yml --profile dev up    # hot reload, port 3000, source mounted
docker compose -f docker-compose-dev.yml --profile prod up   # built image, port 3001
```

`docker-compose-dev.yml` mounts the repo at `/app` with anonymous volumes over `node_modules` and `.next`, and mounts `/home/admin/git/captions` read-only.

## Production deploy

```bash
cd ~/containers
docker compose config -q                       # validate merged config (must be run from ~/containers)
docker compose build --pull subtitle_editor    # --pull is REQUIRED, see below
docker compose up -d subtitle_editor
docker exec nginx nginx -t && docker exec nginx nginx -s reload
uv run --project ~/SCRIPTS/py_amr -m waf.purge_cache --host subtitle-editor.amruta.org
```

- **`--pull` is not optional.** BuildKit resolves `node:26.13.1-alpine` to whatever digest it has cached; without `--pull` a rebuild silently reuses the old base and still reports success.
- The nginx reload is required after recreating the container so the proxy drops cached upstream resolution. `nginx -s reload` is zero-downtime; a full `docker restart nginx` is not needed and should be avoided.
- Do not `docker restart subtitle_editor` right after `up -d` — the container was just created.
- Purge Cloudflare after the container is healthy, otherwise users keep the old assets.

Verify the deployed base image actually moved when that matters:

```bash
docker history --format '{{.CreatedBy}}' subtitle-editor:prod | grep -o 'alpine-minirootfs-[0-9.]*-aarch64'
docker run --rm --entrypoint node subtitle-editor:prod -v    # expect the pinned version
```

## Container facts

| Property    | Value                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| Image       | `subtitle-editor:prod` (built locally, `pull_policy: never`)                                                 |
| Container   | `subtitle_editor`                                                                                            |
| Network     | `my_network`, pinned `192.168.1.109` — nginx caches upstream IPs at config load                              |
| Memory      | `1g`                                                                                                         |
| Healthcheck | `GET /api/health` (public; see [security.md](security.md))                                                   |
| Env         | `env_file: .env.local`                                                                                       |
| Mounts      | `../subtitle-translator-sqlpage/uploads:/app/shared_uploads:ro`, `/home/admin/git/captions:/app/captions:ro` |
| DIUN        | `diun.enable: "false"` — a locally built image has nothing meaningful to compare                             |

## nginx

- Config: `~/containers/nginx/sites/subtitle-editor.amruta.org.conf`
- Applies: validate + reload as shown above.
- Serves the service worker and manifest with `no-cache, no-store` (see [build-and-pwa.md](build-and-pwa.md)).

## Hard refresh

After a deploy that changes the service worker, users must hard-refresh to pick it up. Mention this whenever a release changes PWA behaviour.
