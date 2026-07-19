# subtitle-editor.amruta.org

A fork of [subtitle-editor](https://github.com/laubonghaudoi/subtitle-editor) by [@laubonghaudoi](https://github.com/laubonghaudoi), heavily modified for custom deployment needs. The original project is a minimal, browser-based subtitle editor — this fork builds on that foundation with production infrastructure and extended features.

### What's changed from the original

- **Vimeo integration** — import videos directly from Vimeo via API proxy (`/api/vimeo/*`)
- **SSO authentication** — HMAC-signed SSO cookie verification for access control (`proxy.ts`)
- **Additional locales** — added Arabic (ar), Bengali (bn), German (de), Spanish (es), French (fr), Hindi (hi), Marathi (mr), Polish (pl), Portuguese (pt), Russian (ru), Cantonese (yue), and Chinese (zh) translations
- **Large file support (1GB+)** — streaming MP4 box parser with chunked mdat processing (5MB chunks) via mp4box + Web AudioDecoder; avoids loading entire file into memory
- **Docker deployment** — production Dockerfile with multi-stage builds and nginx reverse proxy
- **Dependabot** — automated dependency updates for npm and Docker base images
- **CI/CD pipeline** — GitHub Actions with lint, test, build, format, and knip checks

### Original features (inherited)

- Multi-track editing
- Waveform visualization
- Localization (en, ar, bn, de, es, fr, hi, mr, pl, pt, ru, yue, zh)
- .srt / .vtt format support
- Progressive Web App (PWA)

## Design principles

- Permanently free and open-source under MIT license
- Fully web-based, no download or installation required
- No account signup or login required, edit subtitles directly in the landing page
- Front-end only with zero backend, thus:
    - Fully extensible and can be plugged in to a custom backend
    - Completely static, support PWA and works offline
    - Subtitle and media files stay local in your browser; hosted infrastructure observability and Google tags may process standard operational or analytics metadata
- Minimalist UX

I talked about my design principles in the [FAQ](https://subtitle-editor.org/faq) and [this issue](https://github.com/laubonghaudoi/subtitle-editor/issues/11#issuecomment-3201949429).

### Tech stacks

- Next.js 16 + React 19 + TypeScript 6
- shadcn/ui + Radix UI + Tailwind CSS 4
- wavesurfer.js 7
- Native HTML media elements
- Tabler icons
- Motion (Framer Motion successor)
- Docker + nginx reverse proxy

## Local Development

### Prerequisites

- **Node.js 24** (see `.nvmrc`)
- **`.env.local`** with:
  - `VIMEO_ACCESS_TOKEN` — Vimeo API access token
  - `SSO_SALT` — HMAC secret for SSO cookie verification

### Setup

```bash
git clone https://github.com/amrutadotorg/subtitle-editor-amruta.git
cd subtitle-editor
nvm use
npm install
# Run the development server with Turbopack.
npm run dev
# Create a production build and type-check.
npm run build
# Serve the pre-built app.
npm run start
```

### Docker

```bash
# Development (hot reload, port 3000)
docker compose --profile dev up

# Production (built image, port 3001)
docker compose --profile prod up
```

### Project Structure

- `app/` – Next.js 16 routing, including the localized editor in `app/[locale]/` and static pages such as `app/faq`.
- `components/` – UI building blocks, with `components/ui/` holding shadcn-based primitives and domain widgets like `subtitle-list.tsx`.
- `context/` – Global state, including the undoable subtitle store.
- `hooks/` – Reusable client hooks (`use-undoable-state`, toast helpers).
- `lib/` – Pure utilities for parsing SRT/VTT, time conversions, and locale helpers.
- `messages/` – Per-locale translation catalogs consumed by `next-intl`.
- `tests/` – Node-based unit tests plus fixtures in `tests/fixtures/`.
- `public/` – Static assets (icons, favicons, etc.).

### Testing

```bash
npm test                # Run the entire suite
npm test -- parse-vtt.test.ts  # Focus on a single file
```

Tests rely on Node's built-in `node:test` runner and cover parsing, time conversions, and multi-track behavior. Add fixtures under `tests/fixtures/` when validating new subtitle edge cases.

### Linting and Formatting

```bash
npm run lint          # ESLint owns code-quality linting
npm run format        # Apply Biome formatting
```

Biome is intentionally configured as the formatter only; ESLint owns lint rules.

## Internationalization

Locales are configured in `lib/locales.ts`. Add new locales by extending the `locales` array, providing metadata, creating a `messages/<locale>.json` file, and translating keys surfaced in `app/[locale]/page.tsx`. Middleware routes traffic based on locale prefixes while defaulting to English.

## Contributing

This is a fork maintained separately from the upstream project. Contributions are welcome — please open issues or PRs against this repository. For upstream features, see the [original repo](https://github.com/laubonghaudoi/subtitle-editor).

## License

Released under the MIT License. See [LICENSE](LICENSE) for details. Original work by [@laubonghaudoi](https://github.com/laubonghaudoi).
