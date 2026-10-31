# Plan wdrożenia: migracja PWA `@ducanh2912/next-pwa` → `@serwist/turbopack`

Status: **plan do wykonania przez agenta AI** · autor: sesja 2026-10-31 · repo: `subtitle-editor`

## Cel

Przenieść generowanie service workera z porzuconego `@ducanh2912/next-pwa`
(ostatnie wydanie 2024-09-18, tylko webpack) na `@serwist/turbopack` 9.5.13, aby:

1. build wrócił na **Turbopack** (dziś `next build --webpack`: 24.9 s vs 12.2 s kompilacji),
2. usunąć łańcuch `workbox-build@7.1.1 → glob@7 → minimatch` (źródło override'ów audytowych),
3. mieć service worker w kodzie (`app/sw.ts`) zamiast przekazywania `workboxOptions` na ślepo.

## Kryteria sukcesu (Definition of Done)

- [ ] `npm run build` **bez** `--webpack`, log pokazuje kompilację Turbopackiem, build < 15 s kompilacji.
- [ ] `GET /serwist/sw.js` → `200`, `content-type: application/javascript`, treść zawiera manifest precache.
- [ ] Fallback offline działa: przy `Network → Offline` w DevTools aplikacja pokazuje `/offline`.
- [ ] `npm run lint`, `npm run test` (196 testów), `npm run format:check` — zielone.
- [ ] `npm audit`: **0 moderate/high/critical** (bez dodawania override na `glob`).
- [ ] `npm audit --omit=dev` w zbudowanym obrazie: 0 podatności.
- [ ] nginx serwuje `/serwist/sw.js` z `Cache-Control: no-cache, no-store, must-revalidate` i `cf-cache-status: BYPASS`.
- [ ] Stary klient z SW zarejestrowanym na `/sw.js` zostaje **wyrejestrowany** (tombstone), nie zostaje z martwym workerem.
- [ ] `AGENTS.md` zaktualizowany (sekcja PWA + „Do Not Touch"), zmiany wypchnięte w `subtitle-editor` **i** `nginx`.

## Non-goals (nie robić w tym zadaniu)

- Nie ruszać `transcribe` (tam PWA to `vite-plugin-pwa`, osobny łańcuch).
- Nie zmieniać strategii cache'owania treści (Vimeo, media) poza przeniesieniem 1:1.
- Nie zmieniać CSP, nagłówków bezpieczeństwa, `proxy.ts` (poza asercją, że matcher nadal omija `.js`).
- Nie migrować na `@serwist/next` (webpack) — tylko wariant turbopackowy.
- Nie zmieniać `output: "standalone"`.

---

## Zasady pracy agenta

- Pracuj w **worktree/branchu**, nie na `main`: `feat/pwa-serwist-turbopack`.
  `tools.opencode.worktree_create` albo `git switch -c feat/pwa-serwist-turbopack`.
- Deploy na produkcję **dopiero po Fazie 3** (weryfikacja lokalna). Faz 1–3 nie dotyka serwera.
- Każda zmiana plików konfiguracyjnych infrastruktury (`nginx/`) to **osobny commit w repo `nginx`**.
- Nie usuwaj override'ów `minimatch`/`glob` z `package.json` „na zapas" — sprawdź `npm audit` po migracji
  i usuń tylko ten, który faktycznie przestał być potrzebny (patrz T3.5).
- Nie edytuj `public/sw.js` ręcznie poza T4.1 (tombstone) — plik jest generowany/ignorowany.
- Zanim zaczniesz: przeczytaj `AGENTS.md` → sekcje „PWA build uses webpack", „Dependency Updates",
  „Do Not Touch", „Verification Workflow".
- Wszystkie komendy uruchamiaj z `~/containers/subtitle-editor`, deploy z `~/containers`.

---

## FAZA 0 — Rozpoznanie i baseline

### T0.1 — Baseline pomiarów (zapisz wyniki w opisie PR/commita)

```bash
cd ~/containers/subtitle-editor
npm run build 2>&1 | grep -E "Compiled|Route|pwa"
ls -l public/sw.js public/workbox-*.js
grep -o "revision" public/sw.js | wc -l      # ~67 wpisów precache
npm audit --json | python3 -c "import json,sys;print(json.load(sys.stdin)['metadata']['vulnerabilities'])"
```

Oczekiwane przed migracją: 1 plik `sw.js` + 1 `workbox-*.js`, 67 precache, 0 moderate.

### T0.2 — Inwentaryzacja punktów styku (potwierdź, nie zmieniaj)

| Plik | Rola |
| --- | --- |
| `next.config.ts` | `withPWAInit`, `fallbacks.document: "/offline"`, `workboxOptions.runtimeCaching` |
| `components/service-worker-register.tsx` | ręczna rejestracja `/sw.js` (używa `window.workbox` jeśli jest) |
| `app/layout.tsx:101` | `<ServiceWorkerRegister />` |
| `public/manifest.json` | manifest PWA (zostaje bez zmian) |
| `proxy.ts` | matcher `/((?!_next|api|.*\..*).*)` — `.js` omija SSO (potwierdź) |
| `nginx/sites/subtitle-editor.amruta.org.conf` | reguła no-cache `^/(sw\.js\|workbox-[^/]+\.js\|manifest\.json)$` |
| `.gitignore` | `/public/sw.js`, `/public/workbox-*.js` — **przeszkoda dla tombstone (T4.1)** |

### T0.3 — Sprawdź, czy `@serwist/turbopack` wspiera twoją wersję Next

```bash
npm view @serwist/turbopack version peerDependencies
node -p "require('./package.json').dependencies.next"
node -p "require('./package.json').dependencies['@ducanh2912/next-pwa']"
```

Wymagane: `next >= 14`, `typescript >= 5`. `esbuild` i `esbuild-wasm` są **opcjonalnymi** peerami —
wystarczy jeden z nich. Jeśli w obrazie `esbuild` (binarka musl) nie działa, sięgamy po `esbuild-wasm` (T3.2).

**STOP CONDITION:** jeśli `next` w repo jest < 14 albo `@serwist/turbopack` wymaga Nexta nowszego niż
mamy — przerwij i zaraportuj, nie improwizuj.

---

## FAZA 1 — Zależności i konfiguracja

### T1.1 — Instalacja

```bash
npm i -D @serwist/turbopack serwist esbuild
npm uninstall @ducanh2912/next-pwa
```

Uwaga: `@ducanh2912/next-pwa` jest dziś w `dependencies` (nie `devDependencies`) — po migracji
nie może zostać w żadnej z sekcji.

### T1.2 — `next.config.ts`

- usuń `import withPWAInit, { runtimeCaching } from "@ducanh2912/next-pwa";` oraz blok `withPWAInit({...})`,
- dodaj `import { withSerwist } from "@serwist/turbopack";`,
- eksport: `export default withSerwist(withNextIntl(nextConfig));`,
- **nie ruszaj** `cspHeader`, `headers()`, `reactCompiler`, `output: "standalone"`, `allowedDevOrigins`.
- Konfigurację cache'owania przenosisz do `app/sw.ts` (T2.1), nie do `next.config.ts`.

### T1.3 — `package.json` scripts

```diff
- "build": "next build --webpack",
+ "build": "next build",
```

`dev` zostaje `next dev --turbopack`.

### T1.4 — Sanity

```bash
grep -rn "@ducanh2912/next-pwa" --include="*.ts" --include="*.tsx" --include="*.json" . | grep -v node_modules
```

Oczekiwane: brak trafień (poza `package-lock.json` po reinstalacji — nie powinno być).

---

## FAZA 2 — Kod service workera

### T2.1 — `app/sw.ts` (nowy plik)

Szablon do adaptacji (dokumentacja: <https://serwist.pages.dev/docs/next/turbo>):

```ts
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,          // odpowiednik dotychczasowego skipWaiting
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/offline",       // NIE zmieniaj na /~offline, mamy własną trasę
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
```

Wymagania:

- `fallbacks.entries[0].url` = **`/offline`** (istniejąca trasa, `app/offline/page.tsx`).
- `skipWaiting: true` — zachowaj, to było w `workboxOptions`.
- Nie dodawaj `additionalPrecacheEntries` z `spawnSync("git", …)` — w obrazie produkcyjnym nie ma repo
  gita; jeśli wersjonowanie jest potrzebne, użyj `crypto.randomUUID()` (patrz T2.2).

### T2.2 — `app/serwist/[path]/route.ts` (nowy plik, katalog `app/serwist/`)

```ts
import { createSerwistRoute } from "@serwist/turbopack";

const revision = crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "app/sw.ts",
    additionalPrecacheEntries: [{ url: "/offline", revision }],
    useNativeEsbuild: true, // jeśli w standalone padnie → false + esbuild-wasm (T3.2)
  });
```

Wymagania:

- Ścieżka publiczna: `/serwist/sw.js` (matcher `proxy.ts` omija pliki z kropką — **potwierdź curl-em**).
- Nie dodawaj tu innych eksportów niż te z `createSerwistRoute` — Next 16 odrzuca nadmiarowe eksporty
  w plikach tras (dokładnie ten błąd naprawialiśmy w `app/api/vimeo/download/route.ts`).

### T2.3 — `app/layout.tsx`

```diff
- import ServiceWorkerRegister from "@/components/service-worker-register";
+ import { SerwistProvider } from "@serwist/turbopack/react";
 ...
-          <ServiceWorkerRegister />
+          <SerwistProvider swUrl="/serwist/sw.js">{/* children bez zmian */}</SerwistProvider>
```

`SerwistProvider` musi obejmować drzewo aplikacji (dzieci), a nie być pustym elementem jak poprzednik.
Zachowaj `suppressHydrationWarning`/istniejącą strukturę `<body>`.

### T2.4 — Usuń stary rejestrator

```bash
git rm components/service-worker-register.tsx
grep -rn "service-worker-register" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```

Oczekiwane: brak trafień.

### T2.5 — `knip.json` / lint

Jeśli `npm run knip` zgłasza `app/sw.ts` jako nieużywany — dodaj go do `ignore`/`entry` w `knip.json`
(minimalna zmiana, bez refaktorów).

---

## FAZA 3 — Weryfikacja lokalna (brama przed deployem)

### T3.1 — Build

```bash
rm -rf .next public/sw.js public/workbox-*.js
npm run build 2>&1 | tee /tmp/build-serwist.log
grep -E "Compiled|Route|serwist|error" /tmp/build-serwist.log | head -20
```

Oczekiwane: kompilacja Turbopackiem, brak `public/sw.js` (worker jest teraz serwowany z trasy),
brak `workbox-*.js`, brak błędów TS. Zapisz czas kompilacji (cel: ~12 s).

**STOP CONDITION:** jeśli build wywala `esbuild` (nie ma binarki musl) → T3.2.

### T3.2 — Fallback, jeśli esbuild nie działa w obrazie

1. Ustaw `useNativeEsbuild: false` w `app/serwist/[path]/route.ts`.
2. `npm i -D esbuild-wasm`.
3. Powtórz T3.1 + T5.3 (weryfikacja w kontenerze). Zanotuj wybór w `AGENTS.md`.

### T3.3 — Smoke test lokalny

```bash
npm run build && npm start &   # albo: node .next/standalone/server.js
sleep 5
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/serwist/sw.js
curl -s http://localhost:3000/serwist/sw.js | head -c 200
curl -s -o /dev/null -w "offline=%{http_code}\n" http://localhost:3000/offline
```

Oczekiwane: `200 application/javascript`, w treści `serwist`/precache, `/offline` = 200.

### T3.4 — Jakość

```bash
npm run lint          # --max-warnings=0
npm run test          # 196/196
npm run format:check  # biome, "Found 1 info" jest OK (pre-existing)
```

### T3.5 — Audyt

```bash
npm audit --json | python3 -c "import json,sys;d=json.load(sys.stdin)['metadata']['vulnerabilities'];print(d)"
npm ls glob minimatch workbox-build 2>/dev/null | head
```

Oczekiwane: 0 moderate+; `glob@7` i `workbox-build` **zniknęły**. `minimatch` pochodzi teraz z
`eslint`/`eslint-config-next` → override `^11.0.3` **zostaje**. Override'u `glob` w tym repo nie ma
(jest tylko w `transcribe`), więc nic tu nie usuwaj — po prostu potwierdź przez `npm ls glob`, że
`glob@7` nie jest już w drzewie.

### T3.6 — Offline manualnie (wymagane, nie da się zautomatyzować bez Playwrighta)

1. `npm start`, otwórz `http://localhost:3000` w Chrome.
2. DevTools → Application → Service Workers: aktywny worker o URL `/serwist/sw.js`, scope `/`.
3. Application → Cache Storage: wpisy z pre-cache (strony + `_next/static`).
4. Network → Offline, przeładuj stronę → widok `/offline`.
5. Network → Online, przeładuj → aplikacja wraca.

Zapisz w PR zrzut/opis wyniku. **Bez tego kroku nie przechodź do Fazy 4.**

---

## FAZA 4 — Infrastruktura i deploy

### T4.1 — Tombstone dla starego `/sw.js` (WAŻNE)

Klienci, którzy mają zarejestrowany SW pod `/sw.js`, po migracji dostaną 404 przy `update()` i
**zostaną z martwym workerem** (cache może serwować nieaktualne assety). Rozwiązanie:

1. Utwórz `public/sw.js` (statyczny plik, nie generowany), treść:

   ```js
   // Tombstone: stary worker z next-pwa. Wyrejestrowuje się i czyści cache,
   // po czym klient przejmuje /serwist/sw.js. Usunąć po ~2 wydaniach.
   self.addEventListener("install", () => self.skipWaiting());
   self.addEventListener("activate", async (event) => {
     event.waitUntil(
       (async () => {
         const keys = await caches.keys();
         await Promise.all(keys.map((k) => caches.delete(k)));
         await self.registration.unregister();
       })(),
     );
   });
   ```

2. `.gitignore`: usuń linie `/public/sw.js` i `/public/workbox-*.js` **albo** (lepiej) zamień na
   komentarz z wyjaśnieniem; `workbox-*.js` nie będzie już generowany, `public/sw.js` musi być w repo.
3. Dodaj komentarz w `AGENTS.md` „Do Not Touch": `public/sw.js` to teraz **ręczny tombstone**, nie
   artefakt builda.

### T4.2 — nginx (`repo: nginx`, osobny commit)

Plik: `nginx/sites/subtitle-editor.amruta.org.conf`, blok „Cache busting: PWA service worker".

```diff
-    location ~* ^/(sw\.js|workbox-[^/]+\.js|manifest\.json)$ {
+    location ~* ^/(serwist/sw\.js|sw\.js|workbox-[^/]+\.js|manifest\.json)$ {
```

Komenda weryfikująca:

```bash
cd ~/containers/nginx && grep -n "serwist/sw" sites/subtitle-editor.amruta.org.conf
```

**Nie ruszaj** innych lokalizacji ani nagłówków bezpieczeństwa.

### T4.3 — Build i deploy obrazu

```bash
cd ~/containers
docker compose config -q
docker compose build subtitle_editor
docker compose up -d subtitle_editor
docker exec nginx nginx -t && docker exec nginx nginx -s reload
```

(Uwaga: `subtitle_editor` ma przypięte IP `192.168.1.109`, więc reload nie jest wymuszony przez zmianę
adresu — ale rób go zawsze po deployu, zgodnie z `~/containers/AGENTS.md`.)

### T4.4 — Weryfikacja produkcyjna

```bash
curl -s -o /dev/null -w "app=%{http_code}\n"        -L https://subtitle-editor.amruta.org/
curl -s -o /dev/null -w "sw=%{http_code}\n"            https://subtitle-editor.amruta.org/serwist/sw.js
curl -s -o /dev/null -w "tombstone=%{http_code}\n"     https://subtitle-editor.amruta.org/sw.js
curl -s -o /dev/null -w "offline=%{http_code}\n"    -L https://subtitle-editor.amruta.org/offline
curl -sI https://subtitle-editor.amruta.org/serwist/sw.js | grep -iE "HTTP|cache-control|content-type|cf-cache-status"
```

Oczekiwane: 200/200/200/200; `cache-control: no-cache, no-store, must-revalidate`; `cf-cache-status: BYPASS`.

```bash
docker run --rm --entrypoint sh subtitle-editor:prod -c 'ls /app/public/sw.js && ls /app/app/serwist 2>/dev/null || true'
docker exec subtitle_editor sh -c 'cd /app && npm audit --omit=dev --json | head -c 200'
```

### T4.5 — Purge cache

```bash
cd ~/containers && uv run --project ~/SCRIPTS/py_amr -m waf.purge_cache --host subtitle-editor.amruta.org
```

### T4.6 — Dokumentacja (`AGENTS.md`)

Zaktualizuj:

- sekcję „PWA build uses webpack (not Turbopack)" → zamień na „PWA: `@serwist/turbopack`" z:
  - powodem migracji (next-pwa porzucony 2024-09, brak Turbopacka),
  - mapą plików (`app/sw.ts`, `app/serwist/[path]/route.ts`, `SerwistProvider` w `app/layout.tsx`),
  - informacją o tombstones `/sw.js` i dacie planowanego usunięcia,
  - notką o `useNativeEsbuild` (który wariant wybrano),
- „Do Not Touch": usuń `public/sw.js`/`workbox-*.js` jako artefakty builda, dodaj tombstone,
- „Dependency Updates": jeśli override `minimatch` przestał być potrzebny — usuń i zaktualizuj opis.

### T4.7 — Commity

```bash
# repo subtitle-editor
git add -A
git commit -m "feat(pwa): migrate service worker from next-pwa to @serwist/turbopack"
git push   # branch protection: PR + CI, albo świadomy bypass admina

# repo nginx
cd ~/containers/nginx
git add sites/subtitle-editor.amruta.org.conf
git commit -m "feat(subtitle-editor): no-cache for /serwist/sw.js"
git push
```

---

## FAZA 5 — Rollback

Jeśli po T4.4 cokolwiek jest nie tak:

1. `git revert <commit>` w `subtitle-editor` → `npm ci` → `docker compose build subtitle_editor` →
   `up -d` → `nginx -s reload`.
2. nginx: revert commita z T4.2 (reguła `sw.js` była już wcześniej, więc rollback jej nie psuje).
3. Klienci: nowy worker `/serwist/sw.js` zostanie zastąpiony przez stary `/sw.js` przy następnym
   `update()`; jeśli nie — `DevTools → Application → Unregister` u użytkownika (incydentalnie).
4. Nie usuwaj tombstone z T4.1 przy rollbacku — działa w obie strony.

---

## Ryzyka i punkty decyzyjne

| Ryzyko | Prawd. | Wpływ | Mitygacja |
| --- | --- | --- | --- |
| `esbuild` nie działa w obrazie alpine (musl) | średnie | build/deploy | T3.2: `useNativeEsbuild: false` + `esbuild-wasm` |
| Route handler w `output: "standalone"` nie serwuje SW w prod | średnie | brak PWA | T4.4 wykrywa; fallback: serwuj SW jako plik statyczny z `public/` generowany w buildzie |
| Stary SW nigdy się nie odświeży | wysokie (bez T4.1) | stare assety z cache | Tombstone T4.1, obowiązkowy |
| `runtimeCaching` z next-pwa nie mapuje się 1:1 na `defaultCache` | średnie | inny cache mediów | T3.6 + test odtwarzania Vimeo/audio po deployu |
| `@serwist/next` (webpack) zamiast turbopack wciągnie `glob@13` | niskie (nie używamy) | audyt | T3.5: `npm ls glob` musi być puste |
| Precache > limit rozmiaru (domyślnie 2 MB/plik) | niskie | brak części precache | sprawdź ostrzeżenia w logu builda |

## Otwarte decyzje (podejmij przed Fazą 4)

1. **Czy zostawiamy `/serwist/sw.js`, czy wystawiamy trasę pod `/sw.js`?**
   Rekomendacja: `/serwist/sw.js` + tombstone — mniej ryzyka, zgodne z docs.
2. **Jak długo trzymać tombstone?** Rekomendacja: 2 wydania / ~4 tygodnie, potem usunąć plik i
   wpis w `.gitignore`, zostawiając `return 404` po stronie nginx (opcjonalnie).
3. **Czy `@ducanh2912/next-pwa` ma zniknąć z `dependencies` w tym samym commicie?**
   Rekomendacja: tak, inaczej `npm ci` w obrazie dalej go instalował.

---

## Ściągawka: stan obecny vs docelowy

| Aspekt | Dziś | Po migracji |
| --- | --- | --- |
| Build | `next build --webpack` (24.9 s kompilacji) | `next build` (Turbopack, ~12 s) |
| Worker | generowany `public/sw.js` (workbox 7) | `app/sw.ts` → `/serwist/sw.js` |
| Konfiguracja cache | `workboxOptions.runtimeCaching` (import z next-pwa) | `runtimeCaching: defaultCache` + własne reguły w `sw.ts` |
| Rejestracja | `components/service-worker-register.tsx` | `SerwistProvider` w `app/layout.tsx` |
| `glob@7`/`workbox-build` | obecne (override `minimatch` konieczny) | brak |
| nginx no-cache | `^/(sw\.js\|workbox-…\|manifest\.json)$` | `^/(serwist/sw\.js\|sw\.js\|workbox-…\|manifest\.json)$` |
| Stary klient | — | `/sw.js` tombstone wyrejestrowuje + czyści cache |
