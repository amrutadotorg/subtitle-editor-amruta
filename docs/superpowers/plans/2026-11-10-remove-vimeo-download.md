# Plan wycofania: automatyczne pobieranie plików z Vimeo

> **Dla agentów:** plan wykonawczy krok-po-kroku. Każde zadanie kończy się zielonym `npm run test`.
> Po całości obowiązuje pełny [Verification Workflow](../../../AGENTS.md#verification-workflow).

**Cel:** usunąć z aplikacji całą funkcjonalność automatycznego pobierania wideo z Vimeo
(przycisk „Load from Vimeo", dialog URL, serwer-proxy API `/api/vimeo/download`,
auto-download z `?vimeo_id`, cache IndexedDB, overlay postępu/błędu w odtwarzaczu).
Przywracanie sesji (`localStorage`) nadal działa, ale bez odtwarzania Vimeo video —
`vimeoVideoId` znika ze snapshotu.

**Motywacja:** funkcja „Download from Vimeo" wymaga utrzymywania `VIMEO_ACCESS_TOKEN`
i serwer-proxy w route API; była używana wyłącznie wewnętrznie. Upraszcza CSP, zmniejsza
surface ataku i usuwa jedyny powód istnienia zmiennej środowiskowej `VIMEO_ACCESS_TOKEN`.

**Tech stack:** TypeScript 6 (strict), React 19 + React Compiler, next-intl, Tailwind v4,
Node test runner (`tsx --test`), jsdom + `tests/helpers/render.ts`.

---

## Zakres

W zakresie:

- usunięcie endpointu API `app/api/vimeo/download/route.ts` i testów API w `tests/api-routes.test.ts`,
- usunięcie komponentu `VimeoLoader` (dialog z inputem URL, progress bar, pobieranie),
- usunięcie hooków: `use-auto-restore-vimeo.ts`, `use-vimeo-url-loader.ts`,
- usunięcie modułów: `lib/vimeo-url.ts`, `lib/vimeo-file-cache.ts`,
- usunięcie pliku testów `tests/vimeo.test.ts` (testy kompatybilności wstecznej snapshotu przenoszone do `tests/local-session.test.ts`),
- usunięcie stanu `vimeoVideoId` z kontekstu (`types.ts`, `provider.tsx`, orkiestracja sesji),
- usunięcie pola `vimeoVideoId` ze snapshotu (`lib/local-session.ts`) — stare snapshoty z tym
  polem nadal się parsują (kompatybilność wsteczna), ale pole jest ignorowane,
- usunięcie klucza `vimeo:` z `buildWorkspaceKey()` w `lib/last-position.ts` i aktualizacja `tests/last-position.test.ts`,
- usunięcie interfejsu `VimeoLoadingState` i propów Vimeo z `VideoPlayer`,
- usunięcie przycisku Vimeo i dialogu z `AppHeader`,
- usunięcie overlaya pobierania/błędu, linku „Load from Vimeo" oraz nieużywanych ikon (`IconBrandVimeo`, `IconX`, `IconAlertCircle`) z `VideoPlayer`,
- aktualizacja wywołania `useResumeCursor` w `editor-app.tsx` (`mediaKey: mediaFile ? ... : null`) oraz aktualizacja JSDoc w `hooks/use-resume-cursor.ts`,
- usunięcie propa `peaksCacheKey` z wywołania `<WaveformVisualizer />` w `editor-app.tsx` i aktualizacja JSDoc w `components/waveform-visualizer/index.tsx`,
- usunięcie kluczy i18n `vimeoLoader.*` i `videoPlayer.loadFromVimeo` ze wszystkich 13 locale,
- usunięcie domen `*.vimeocdn.com`, `*.vimeo.com`, `api.vimeo.com` z CSP w `next.config.ts`,
- usunięcie `VIMEO_ACCESS_TOKEN` z `.env.local` i `.env.local.example`,
- aktualizacja dokumentacji w `AGENTS.md` (Overview, Directory Structure, Environment Setup, sekcja PWA webpack) oraz `README.md`,
- usunięcie obsługi parametrów `?vimeo_id` i `?vimeo_id_url` (brak pobierania / otwierania modala),
- zachowanie i ujednolicenie czyszczenia legacy parametrów `?vimeo_id` oraz `?vimeo_id_url` z paska adresu URL (zarówno przy imporcie w `use-shared-subtitle-url-loader.ts`, jak i przy bezpośrednim wejściu w `editor-app.tsx`), aby linki generowane przez zewnętrzne narzędzia nie pozostawiały martwych parametrów w przeglądarce.

Poza zakresem:

- API routes `/api/load-shared` i `/api/load-captions` — nie są powiązane z Vimeo,
- parametr `?import` / `?caption` — nadal działają jak dotychczas,
- `peaksCacheKey` w `WaveformVisualizer` — prop jest opcjonalny; usuwamy go z `editor-app.tsx` (pliki lokalne nie mają stabilnego klucza cross-session — zachowanie identyczne jak dotychczas dla plików),
- usunięcie bazy IndexedDB `subtitle-editor-vimeo-cache` z przeglądarek użytkowników
  (browser sam ją wyczyści po pewnym czasie; nie warto kodować migracji).

---

## Inwentarz plików do zmiany

### Pliki do usunięcia (całe)

| Plik                              | Opis                                              |
| --------------------------------- | ------------------------------------------------- |
| `app/api/vimeo/download/route.ts` | Serwer-proxy Vimeo API                            |
| `components/vimeo-loader.tsx`     | Dialog „Load from Vimeo"                          |
| `hooks/use-auto-restore-vimeo.ts` | Auto-restore video z IndexedDB po session restore |
| `hooks/use-vimeo-url-loader.ts`   | Auto-download z `?vimeo_id` query param           |
| `lib/vimeo-url.ts`                | `extractVideoId()`                                |
| `lib/vimeo-file-cache.ts`         | IndexedDB cache (`getCachedFile`/`setCachedFile`) |
| `tests/vimeo.test.ts`             | Testy `extractVideoId` + snapshot vimeoVideoId    |

### Pliki do zmodyfikowania

| Plik                                       | Co usunąć / zmienić                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/api-routes.test.ts`                 | Usunięcie testów `vimeo/download`, importu `vimeoGet`, zmiennej `origToken` oraz zarządzania `VIMEO_ACCESS_TOKEN`                                                                                                                                                                                                                                |
| `tests/local-session.test.ts`              | Dodanie testu kompatybilności wstecznej (stary snapshot z polem `vimeoVideoId` parsuje się poprawnie, a pole jest ignorowane)                                                                                                                                                                                                                    |
| `tests/last-position.test.ts`              | Aktualizacja testów `buildWorkspaceKey` — usunięcie przypadków `vimeo:`, aktualizacja wywołań bez parametru `vimeoVideoId`                                                                                                                                                                                                                       |
| `context/subtitle/types.ts`                | Usunięcie `vimeoVideoId` i `setVimeoVideoId` z interfejsu `LocalSessionValue`                                                                                                                                                                                                                                                                    |
| `lib/local-session.ts`                     | Usunięcie `vimeoVideoId` z `LocalSessionSnapshot`, `CreateLocalSessionSnapshotInput`, `createLocalSessionSnapshot`, `parseLocalSessionSnapshot` (parse toleruje obecność pola i je ignoruje)                                                                                                                                                     |
| `hooks/use-local-session-orchestration.ts` | Stan `vimeoVideoId`, `setVimeoVideoId`, uproszczenie `workspaceKeys` i `restoredWorkspaceKeys` w `restoreLocalSession` (wyłącznie z `track.name`), usunięcie `setVimeoVideoIdState`                                                                                                                                                              |
| `context/subtitle/provider.tsx`            | Usunięcie `vimeoVideoId`/`setVimeoVideoId` z destrukturyzacji hooka orkiestracji i z `useMemo`                                                                                                                                                                                                                                                   |
| `lib/last-position.ts`                     | `buildWorkspaceKey`: usunięcie parametru `vimeoVideoId` i gałęzi `vimeo:` (pozostaje wyłącznie `track:`)                                                                                                                                                                                                                                         |
| `hooks/use-resume-cursor.ts`               | Aktualizacja komentarza JSDoc przy `mediaKey` (usunięcie wzmianki o Vimeo)                                                                                                                                                                                                                                                                       |
| `components/app-header/app-header.tsx`     | Przycisk Vimeo, import `VimeoLoader`, `IconBrandVimeo`, dialog, propsy `isVimeoOpen`/`onSetVimeoOpen`/`vimeoInitialUrl`                                                                                                                                                                                                                          |
| `components/video-player.tsx`              | `VimeoLoadingState`, propsy `onOpenVimeo`/`vimeoLoadingState`/`onVimeoLoadCancel`, overlay pobierania/błędu, link „Load from Vimeo", importy `IconBrandVimeo`, `IconX`, `IconAlertCircle`, handler klawisza Escape                                                                                                                               |
| `components/editor/editor-app.tsx`         | Importy i stany Vimeo (`vimeoVideoId`, `isVimeoOpen`, `vimeoInitialUrl`, `vimeoAutoLoad`, `vimeoAbortControllerRef`), hooki Vimeo, propsy do `AppHeader` i `VideoPlayer`, `mediaKey` w `useResumeCursor`, usunięcie propa `peaksCacheKey` z `<WaveformVisualizer />`, `hasMedia`, jednorazowy efekt montowania czyszczący parametry legacy z URL |
| `hooks/use-shared-subtitle-url-loader.ts`  | Zachowanie czyszczenia `vimeo_id` i dodanie czyszczenia `vimeo_id_url` po zaimportowaniu napisów                                                                                                                                                                                                                                                 |
| `components/waveform-visualizer/index.tsx` | Aktualizacja komentarza JSDoc przy `peaksCacheKey` — usunięcie wzmianki o `vimeoVideoId`                                                                                                                                                                                                                                                         |
| `messages/*.json` (×13)                    | Usunięcie sekcji `vimeoLoader` oraz klucza `videoPlayer.loadFromVimeo`                                                                                                                                                                                                                                                                           |
| `next.config.ts`                           | Usunięcie domen `*.vimeocdn.com`, `*.vimeo.com`, `api.vimeo.com` z `media-src` i `connect-src`                                                                                                                                                                                                                                                   |
| `.env.local`                               | Usunięcie `VIMEO_ACCESS_TOKEN`                                                                                                                                                                                                                                                                                                                   |
| `.env.local.example`                       | Usunięcie `VIMEO_ACCESS_TOKEN`                                                                                                                                                                                                                                                                                                                   |
| `AGENTS.md`                                | Usunięcie wzmianek o Vimeo z Overview, Directory Structure, Environment Setup oraz sekcji PWA webpack                                                                                                                                                                                                                                            |
| `README.md`                                | Usunięcie punktu o integracji z Vimeo z listy funkcji i `VIMEO_ACCESS_TOKEN` z konfiguracji środowiska                                                                                                                                                                                                                                           |

---

## Zadania (krok-po-kroku z zielonym `npm run test` po każdym zadaniu)

### Zadanie 1: Przygotowanie testów i usunięcie endpointu API

Cel: usunąć serwer-proxy `/api/vimeo/download` oraz zależne testy, zabezpieczając test wstecznej kompatybilności snapshotu sesji. Po tym zadaniu `npm run test` natychmiast przechodzi.

**Pliki:**

- Modyfikacja: `tests/local-session.test.ts`
- Modyfikacja: `tests/api-routes.test.ts`
- Usunięcie: `tests/vimeo.test.ts`
- Usunięcie: `app/api/vimeo/download/route.ts`

Kroki:

- [x] **Step 1:** W `tests/local-session.test.ts` dodaj test kompatybilności wstecznej sprawdzający, że surowy JSON snapshotu z polem `"vimeoVideoId": "12345"` parsuje się bez błędu przez `parseLocalSessionSnapshot` (zwraca poprawny obiekt sesji, napisy są odczytane, a pole `vimeoVideoId` jest ignorowane).
- [x] **Step 2:** W `tests/api-routes.test.ts`:
  - Usuń import `vimeoGet` z `../app/api/vimeo/download/route`.
  - Usuń zmienną `origToken` i zarządzanie `process.env.VIMEO_ACCESS_TOKEN` w hooku `afterEach`.
  - Usuń całą sekcję `/api/vimeo/download` (5 testów: 401 without SSO, 500 without token, 400 missing url, 400 invalid URL, 400 empty url).
- [x] **Step 3:** Usuń plik `tests/vimeo.test.ts`.
- [x] **Step 4:** Usuń plik `app/api/vimeo/download/route.ts` oraz usuń puste katalogi `app/api/vimeo/download/` i `app/api/vimeo/`.
- [x] **Step 5:** Uruchom `npm run test` — wszystkie pozostałe testy muszą przejść na zielono.

---

### Zadanie 2: Kontekst sesji i snapshot (`types`, `local-session`, `orchestration`, `provider`)

Cel: usunąć stan i pole `vimeoVideoId` z warstwy stanu i trwałości sesji.

**Pliki:**

- Modyfikacja: `context/subtitle/types.ts`
- Modyfikacja: `lib/local-session.ts`
- Modyfikacja: `hooks/use-local-session-orchestration.ts`
- Modyfikacja: `context/subtitle/provider.tsx`

Kroki:

- [x] **Step 1:** `context/subtitle/types.ts` — usuń `vimeoVideoId: string | null` oraz `setVimeoVideoId: (id: string | null) => void` z interfejsu `LocalSessionValue`.
- [x] **Step 2:** `lib/local-session.ts`:
  - Usuń `vimeoVideoId?: string` z interfejsu `LocalSessionSnapshot`.
  - Usuń `vimeoVideoId?: string` z interfejsu `CreateLocalSessionSnapshotInput`.
  - W `createLocalSessionSnapshot`: usuń przypisanie pola `vimeoVideoId`.
  - W `parseLocalSessionSnapshot`: usuń odczyt `vimeoVideoId` (pole nie jest dodawane do zwracanego obiektu sesji; parser nie rzuca błędu, toleruje jego obecność w starych plikach JSON).
- [x] **Step 3:** `hooks/use-local-session-orchestration.ts`:
  - Usuń stan `vimeoVideoId` i callback `setVimeoVideoId` (linie ~75–80).
  - W `workspaceKeys` useMemo: uprość do mapowania wyłącznie po ścieżkach (`tracks.map(track => buildWorkspaceKey({ vimeoVideoId: null, trackName: track.name }))` — sam parametr `vimeoVideoId` usuniemy w Zadaniu 3).
  - W `createCurrentLocalSession`: usuń pole `vimeoVideoId`.
  - W `restoreLocalSession`:
    - Uprość `restoredWorkspaceKeys` do mapowania wyłącznie po nazwach ścieżek `nextTracks.map(...)` — usuń sprawdzanie `pendingLocalSession.vimeoVideoId`.
    - Usuń wywołanie `setVimeoVideoIdState(...)`.
  - Usuń `vimeoVideoId` i `setVimeoVideoId` z obiektu zwracanego i z interfejsu `LocalSessionOrchestrationResult`.
- [x] **Step 4:** `context/subtitle/provider.tsx`:
  - Usuń destrukturyzację `vimeoVideoId`/`setVimeoVideoId` z hooka `useLocalSessionOrchestration`.
  - Usuń `vimeoVideoId`/`setVimeoVideoId` z obiektu `localSessionValue` i tablicy zależności `useMemo`.
- [x] **Step 5:** Uruchom `npm run test` — testy jednostkowe muszą przejść na zielono.

---

### Zadanie 3: Pozycja kursora i klucz workspace (`last-position`, `use-resume-cursor`)

Cel: wyczyścić obsługę klucza `vimeo:` z mechanizmu wznawiania pozycji oraz zsynchronizować testy.

**Pliki:**

- Modyfikacja: `lib/last-position.ts`
- Modyfikacja: `tests/last-position.test.ts`
- Modyfikacja: `hooks/use-local-session-orchestration.ts`
- Modyfikacja: `hooks/use-resume-cursor.ts`

Kroki:

- [x] **Step 1:** `lib/last-position.ts`:
  - W funkcji `buildWorkspaceKey`: zmień sygnaturę na `buildWorkspaceKey({ trackName }: { trackName: string | null }): string`.
  - Usuń gałąź `if (trimmedVideoId) return \`vimeo:${trimmedVideoId}\``.
  - Klucz generowany jest zawsze jako `track:${normalizedName || "untitled"}`.
- [x] **Step 2:** `tests/last-position.test.ts`:
  - Zaktualizuj test `buildWorkspaceKey prefers vimeo ids and normalises track names`: zmień nazwę na `buildWorkspaceKey normalises track names`, usuń asercję sprawdzającą `vimeo:`, usuń `vimeoVideoId` z wejść testowych.
  - Zaktualizuj pozostałe wywołania `buildWorkspaceKey` w teście.
- [x] **Step 3:** `hooks/use-local-session-orchestration.ts`: zaktualizuj wywołania `buildWorkspaceKey` w `workspaceKeys` i `restoreLocalSession` do postaci `{ trackName: track.name }`.
- [x] **Step 4:** `hooks/use-resume-cursor.ts`: zaktualizuj komentarz JSDoc przy `mediaKey` w `UseResumeCursorParams` (usuń wzmiankę `or Vimeo id`).
- [x] **Step 5:** Uruchom `npm run test` — testy `tests/last-position.test.ts` muszą przejść na zielono.

---

### Zadanie 4: Komponenty UI — Nagłówek i Odtwarzacz wideo (`app-header`, `video-player`)

Cel: usunąć z komponentów UI przycisk Vimeo, modal, overlay ładowania oraz nieużywane ikony.

**Pliki:**

- Modyfikacja: `components/app-header/app-header.tsx`
- Modyfikacja: `components/video-player.tsx`

Kroki:

- [x] **Step 1:** `components/app-header/app-header.tsx`:
  - Usuń import `IconBrandVimeo` z `@tabler/icons-react`.
  - Usuń import `VimeoLoader` z `@/components/vimeo-loader`.
  - Usuń propsy `isVimeoOpen`, `onSetVimeoOpen`, `vimeoInitialUrl` z `AppHeaderProps` i sygnatury komponentu.
  - Usuń destrukturyzację `setVimeoVideoId` z `useLocalSession()`.
  - Usuń element `<Tooltip>` zawierający przycisk z `IconBrandVimeo` (`aria-label={t("vimeoLoader.buttonLabel")}`).
  - Usuń komponent `<VimeoLoader ... />` na dole JSX.
- [x] **Step 2:** `components/video-player.tsx`:
  - Usuń interfejs `export interface VimeoLoadingState { ... }`.
  - Usuń propsy `onOpenVimeo`, `vimeoLoadingState`, `onVimeoLoadCancel` z `VideoPlayerProps` i destrukturyzacji komponentu.
  - Usuń importy ikon `IconBrandVimeo`, `IconX` oraz `IconAlertCircle` z `@tabler/icons-react`.
  - Usuń `useEffect` nasłuchujący klawisza `Escape` (`vimeoLoadingState`/`onVimeoLoadCancel`).
  - W stanie braku mediów (`if (!mediaUrl)`):
    - Usuń cały blok overlaya pobierania Vimeo (`{/* Vimeo auto-load overlay */} ...`).
    - Usuń przycisk / link „Load from Vimeo" (`{onOpenVimeo && (...)}`).
- [x] **Step 3:** Uruchom `npm run test` — testy muszą przejść na zielono.

---

### Zadanie 5: Główny edytor i czyszczenie parametrów URL (`editor-app`, `use-shared-subtitle-url-loader`)

Cel: usunąć stan i hooki Vimeo z głównego edytora, zaktualizować przekazywane propsy, usunąć prop `peaksCacheKey` i wdrożyć czyszczenie legacy parametrów URL.

**Pliki:**

- Modyfikacja: `components/editor/editor-app.tsx`
- Modyfikacja: `hooks/use-shared-subtitle-url-loader.ts`
- Modyfikacja: `components/waveform-visualizer/index.tsx`

Kroki:

- [x] **Step 1:** `components/editor/editor-app.tsx`:
  - Usuń niepotrzebne importy:
    - `VimeoLoadingState` z `@/components/video-player`
    - `getCachedFile`, `setCachedFile` z `@/lib/vimeo-file-cache`
    - `useAutoRestoreVimeo` z `@/hooks/use-auto-restore-vimeo`
    - `useVimeoUrlLoader` z `@/hooks/use-vimeo-url-loader`
  - Usuń z `useLocalSession()` odwołania do `vimeoVideoId` i `setVimeoVideoId`.
  - Usuń wywołanie hooka `useAutoRestoreVimeo(...)`.
  - Usuń wywołanie hooka `useVimeoUrlLoader(...)`.
  - Usuń stany i refy:
    - `isVimeoOpen` / `setIsVimeoOpen`
    - `vimeoInitialUrl` / `setVimeoInitialUrl`
    - `vimeoAutoLoad` / `setVimeoAutoLoad`
    - `vimeoAbortControllerRef`
  - W zamian dodaj jednorazowy montowany `useEffect` usuwający legacy query params (`vimeo_id`, `vimeo_id_url`) z paska adresu:

    ```tsx
    useEffect(() => {
      if (typeof window === "undefined") return;
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has("vimeo_id") || searchParams.has("vimeo_id_url")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("vimeo_id");
        url.searchParams.delete("vimeo_id_url");
        window.history.replaceState({}, "", url.toString());
      }
    }, []);
    ```
  - W wywołaniu `buildWorkspaceKey`: zmień na `{ trackName: activeTrack?.name ?? null }` (zależności `useMemo`: `[activeTrack?.name]`).
  - W wywołaniu `useResumeCursor`: zmień `mediaKey` na:

    ```tsx
    mediaKey: mediaFile ? `${mediaFile.name}:${mediaFile.size}` : null,
    ```
  - Zaktualizuj `hasMedia`: `const hasMedia = Boolean(mediaFile);`.
  - W propsach do `AppHeader`: usuń `isVimeoOpen`, `onSetVimeoOpen`, `vimeoInitialUrl`.
  - W propsach do `VideoPlayer`: usuń `onOpenVimeo`, `vimeoLoadingState`, `onVimeoLoadCancel`.
  - W propsach do `<WaveformVisualizer />`: usuń prop `peaksCacheKey={vimeoVideoId}` (nie przekazuj propa w ogóle).
- [x] **Step 2:** `hooks/use-shared-subtitle-url-loader.ts`:
  - Zachowaj istniejące `url.searchParams.delete("vimeo_id")` i dodaj `url.searchParams.delete("vimeo_id_url")` w bloku czyszczenia po imporcie.
- [x] **Step 3:** `components/waveform-visualizer/index.tsx`:
  - Zaktualizuj komentarz JSDoc przy `peaksCacheKey`: zamień `(e.g. vimeoVideoId)` na ogólny opis (np. `Stable key used to look up / store peak data in IndexedDB when available`).
- [x] **Step 4:** Uruchom `npm run test` — wszystkie testy muszą przejść na zielono.

---

### Zadanie 6: Usunięcie martwych plików czysto-Vimeo

Cel: skasować pliki, które po wyczyszczeniu konsumentów stały się całkowicie martwe.

**Pliki do usunięcia:**

- `components/vimeo-loader.tsx`
- `hooks/use-auto-restore-vimeo.ts`
- `hooks/use-vimeo-url-loader.ts`
- `lib/vimeo-url.ts`
- `lib/vimeo-file-cache.ts`

Kroki:

- [x] **Step 1:** Usuń powyższe 5 plików (`rm`).
- [x] **Step 2:** Uruchom `npm run test` — weryfikacja, że żaden test ani moduł nie zależy już od usuniętych plików.
- [x] **Step 3:** Uruchom `npm run knip` — weryfikacja braku osieroconych eksportów/plików.

---

### Zadanie 7: Usunięcie kluczy tłumaczeń i18n (`messages/*.json`)

Cel: usunąć nieużywane klucze i sekcje i18n ze wszystkich 13 języków aplikacji.

**Pliki:**

- `messages/ar.json`, `messages/bn.json`, `messages/de.json`, `messages/en.json`, `messages/es.json`, `messages/fr.json`, `messages/hi.json`, `messages/mr.json`, `messages/pl.json`, `messages/pt.json`, `messages/ru.json`, `messages/yue.json`, `messages/zh.json`

Kroki:

- [x] **Step 1:** W każdym z 13 plików:
  - Usuń całą sekcję `"vimeoLoader": { ... }` (zawierającą klucze `title`, `description`, `urlLabel`, `load`, `buttonLabel`, `invalidUrl`, `errorForbidden`, `errorNotFound`, `errorGeneric`, `autoLoadDownloading`, `autoLoadError`, `autoLoadRetry`).
  - Usuń klucz `"loadFromVimeo"` z sekcji `"videoPlayer"`.
- [x] **Step 2:** Uruchom `npm run test` — test `tests/locale-parity.test.ts` musi przejść na zielono (parytet kluczy zachowany).

---

### Zadanie 8: Konfiguracja CSP i zmienne środowiskowe (`next.config.ts`, `.env.*`)

Cel: usunąć domeny Vimeo z nagłówków Content Security Policy i wycofać `VIMEO_ACCESS_TOKEN`.

**Pliki:**

- Modyfikacja: `next.config.ts`
- Modyfikacja: `.env.local`
- Modyfikacja: `.env.local.example`

Kroki:

- [x] **Step 1:** `next.config.ts`:
  - Z dyrektywy `media-src` usuń `https://*.vimeocdn.com` oraz `https://*.vimeo.com`.
  - Z dyrektywy `connect-src` usuń `https://*.vimeo.com` oraz `https://api.vimeo.com`.
- [x] **Step 2:** `.env.local`: usuń wpis `VIMEO_ACCESS_TOKEN=...`.
- [x] **Step 3:** `.env.local.example`: usuń wpis `VIMEO_ACCESS_TOKEN=<your_vimeo_api_token>`.
- [x] **Step 4:** Uruchom `npm run test` — wszystkie testy na zielono.

---

### Zadanie 9: Aktualizacja dokumentacji (`AGENTS.md`, `README.md`)

Cel: odzwierciedlić wycofanie Vimeo w dokumentacji deweloperskiej i repozytorium.

**Pliki:**

- Modyfikacja: `AGENTS.md`
- Modyfikacja: `README.md`

Kroki:

- [x] **Step 1:** `AGENTS.md`:
  - W sekcji **Overview** (linia 5): usuń wzmiankę `Vimeo integration`.
  - W sekcji **Directory Structure**:
    - W drzewie `app/api/`: usuń wzmiankę `vimeo/download`.
    - W drzewie `components/`: usuń wpis `vimeo-loader.tsx`.
  - W sekcji **Environment Setup**: usuń `VIMEO_ACCESS_TOKEN` z listy wymaganych zmiennych. Zaktualizuj opis na pojedynczą zmienną `SSO_SALT`.
  - W sekcji **Known Issues** (podsekcja _PWA build uses webpack_, linie ~424–425): usuń zdanie odwołujące się do poprawki błędu exportu w `app/api/vimeo/download/route.ts`.
- [x] **Step 2:** `README.md`:
  - Z listy funkcji usuń punkt `- **Vimeo integration** — import videos directly from Vimeo via API proxy (/api/vimeo/*)`.
  - Z sekcji zmiennych środowiskowych usuń `- VIMEO_ACCESS_TOKEN — Vimeo API access token`.
- [x] **Step 3:** Uruchom `npm run test` — wszystkie testy na zielono.

---

## Pełna weryfikacja końcowa

Wykonaj pełny [Verification Workflow](../../../AGENTS.md#verification-workflow):

```bash
npm run lint            # 1. ESLint — zero warnings
npm run format          # 2. Biome format
npm run format:check    # 3. Biome format verify
npm run test            # 4. Wszystkie testy jednostkowe
npm run knip            # 5. Wykrywanie martwego kodu i nieużywanych zależności
npm run build           # 6. Produkcyjny build (standalone webpack PWA)
```

### Sprawdzenie czystości kodu

```bash
# Żadnych odniesień do Vimeo w kodzie produkcyjnym, testach i konfiguracji (poza planami migracji)
grep -rn -i "vimeo" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
  | grep -v "docs/superpowers/plans" | grep -v "TODO" | grep -v "docs/serwist-migration-plan.md"
# Powinno zwrócić 0 wyników
```

### Ręczny QA (na `npm run dev` w przeglądarce)

1. Przycisk Vimeo **nie** pojawia się w nagłówku aplikacji.
2. Odtwarzacz w stanie „brak mediów” wyświetla wyłącznie opcję załadowania pliku lokalnego — brak linku/przycisku „Load from Vimeo”.
3. Wejście z parametrem `?vimeo_id=123456789` nie wywołuje żadnego pobierania ani overlaya, a parametr `vimeo_id` zostaje natychmiast usunięty z paska adresu URL.
4. Wejście z parametrem `?vimeo_id_url=123456789` nie otwiera modala, a parametr zostaje usunięty z paska adresu URL.
5. Wejście z `?import=file.vtt&vimeo_id=123` ładuje napisy ze współdzielonego pliku, a oba parametry (`import` i `vimeo_id`) znikają z paska adresu.
6. Autosave i restore sesji działają poprawnie (pole `vimeoVideoId` nie jest generowane w nowych snapshotach).
7. Stary snapshot sesji z `vimeoVideoId` w `localStorage` wczytuje się bez błędów konsoli — napisy i preferencje zostają przywrócone.
8. Mechanizm wznawiania pozycji (`last-position`) działa poprawnie wyłącznie po kluczu `track:` (brak wpisów `vimeo:`).
9. Nagłówek CSP w odpowiedzi HTTP nie zawiera już domen `vimeo.com` ani `vimeocdn.com`.
10. Konsola deweloperska przeglądarki jest całkowicie czysta (brak błędów runtime i ostrzeżeń hydracji).

---

## Ryzyka i świadome decyzje

| Ryzyko                                                                         | Mitygacja                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stare snapshoty w localStorage zawierają `vimeoVideoId`                        | `parseLocalSessionSnapshot` ignoruje nieznane pola — snapshot parsuje się bez zmian; `vimeoVideoId` po prostu przepadnie. Użytkownik straci auto-restore wideo Vimeo, ale napisy przywrócą się normalnie. |
| IndexedDB `subtitle-editor-vimeo-cache` pozostaje w przeglądarkach             | Baza jest orphaned — przeglądarka wyczyści ją po pewnym czasie (storage eviction). Nie kodujemy migracji usuwającej bazę — nadmierny koszt vs. zerowe ryzyko.                                             |
| `peaksCacheKey` traci stabilny klucz dla wideo Vimeo                           | Pliki lokalne nigdy nie miały stabilnego klucza — `peaksCacheKey` był `null` dla nich. Waveform peaks po prostu nie są cachowane cross-session (identycznie jak dotąd dla plików wideo).                  |
| Klucze `vimeo:` w `subtitle-editor:position:v1` stają się osieroconymi wpisami | TTL 90 dni + limit 10 wpisów — wypadną naturalnie. `pruneLastPositionStore` działa bez zmian.                                                                                                             |
| `buildWorkspaceKey` traci wariant `vimeo:` — deduplication                     | Nie ma już scenariusza z `vimeoVideoId` — deduplikacja po znormalizowanej nazwie ścieżki (`track:`) jest w zupełności wystarczająca.                                                                      |
| Użytkownicy przyzwyczajeni do przycisku Vimeo                                  | Funkcja była wewnętrzna (Amruta.org only). Alternatywa: pobranie wideo ręcznie i załadowanie przez „Load file".                                                                                           |

---

## Kryteria akceptacji

- [x] Żaden plik źródłowy, testowy ani dokumentacja (`AGENTS.md`, `README.md`) poza historycznymi planami nie zawiera słowa „vimeo”.
- [x] Przycisk „Load from Vimeo” i modal pobierania zostały całkowicie usunięte z UI.
- [x] Endpoint `/api/vimeo/download` nie istnieje (zwraca 404).
- [x] Parametry `?vimeo_id` i `?vimeo_id_url` nie wywołują żadnych akcji i są automatycznie czyszczone z paska adresu URL.
- [x] Stare snapshoty sesji z `vimeoVideoId` parsują się poprawnie — napisy i ustawienia są zachowane.
- [x] CSP nie zawiera domen Vimeo.
- [x] Zmienna `VIMEO_ACCESS_TOKEN` nie występuje w `.env.local` ani `.env.local.example`.
- [x] Każde zadanie w planie kończy się sukcesem `npm run test`.
- [x] Pełny Verification Workflow (`lint`, `format:check`, `test`, `knip`, `build`) przechodzi bez żadnych ostrzeżeń i błędów.
