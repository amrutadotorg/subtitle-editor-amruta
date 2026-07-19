# Audyt techniczny: subtitle-editor-amruta

**Repozytorium:** github.com/amrutadotorg/subtitle-editor-amruta
**Commit audytowany:** `a7ec5d6` (main, stan na 2026-07-18)
**Zakres:** analiza statyczna kodu, konfiguracji, historii Git, `npm audit`. Bez uruchamiania aplikacji w przeglądarce ani profilowania runtime.

---

## Uwaga wstępna dot. założeń audytu

Prompt audytowy zakłada projekt "rozwijany długo, wielokrotnie łatany". Historia Git tego repozytorium **nie potwierdza tego założenia**: cała widoczna historia to 36 commitów rozpięte na 7 dni (2026-07-11 → 2026-07-18), a cały istniejący kod wszedł jednym commitem `"Add full project codebase"` — czyli import gotowego forka, bez śladu wcześniejszej ewolucji. To nie jest projekt z wieloletnim długiem technicznym w sensie git-blame; to świeży, dobrze otagowany fork (`subtitle-editor` by @laubonghaudoi) rozszerzony o integrację Vimeo, SSO i wdrożenie Docker/Cloudflare.

To nie znaczy, że długu technicznego nie ma — poniżej opisano konkretne, realne problemy, w tym **dwie krytyczne luki bezpieczeństwa** — ale trzeba to czytać jako audyt młodego, aktywnie rozwijanego projektu, a nie archeologię wieloletniego legacy.

**Rozpoznanie:** Next.js 16 (App Router) + React 19 + TypeScript 6, front-end-first (zgodnie z założeniem projektu — "Front-end only with zero backend"), z trzema wąskimi API route'ami (`app/api/*`) doklejonymi przez fork do integracji z Vimeo i wdrożeniem self-hosted. Zamierzony wzorzec: komponenty (`components/`) + hooki (`hooks/`) + czyste funkcje biznesowe (`lib/`) + stan globalny w React Context (`context/`). Wzorzec jest w praktyce przestrzegany konsekwentnie — to nie jest projekt z logiką biznesową rozsianą po komponentach.

---

## 1. Rozpoznanie projektu

Next.js 16 / React 19 / TS 6, uruchamiany przez `next dev --turbopack` (dev) i `next start` po `next build --output=standalone` (prod). Wdrożenie: Docker (dev + prod profile w jednym `docker-compose-dev.yml`) za nginx, z Cloudflare jako CDN/WAF przed nginx. Trzy domeny biznesowe: (1) edycja napisów w przeglądarce (offline-first, PWA), (2) import wideo z Vimeo przez proxy API, (3) SSO gate oparty o ciasteczko HMAC wystawiane przez WordPress (`amruta.org`).

```
[PRIORYTET: Niski] README reklamuje funkcję deploymentu, która nie istnieje w repo
Lokalizacja: README.md ("Cloudflare deployment... Cloudflare Workers/Pages with wrangler support"), AGENTS.md (".dev.vars", ".wrangler/"), docker-compose-dev.yml ("SKIP_CF_BINDINGS=true # patrz next.config.ts fix ponizej")
Opis: Trzy niezależne pliki odwołują się do trybu wdrożenia na Cloudflare Workers/Pages (zmienna .dev.vars, katalog .wrangler/, flaga SKIP_CF_BINDINGS z komentarzem odsyłającym do "fixu" w next.config.ts). W repozytorium nie ma ani wrangler.toml/jsonc, ani pakietu @opennextjs/cloudflare / @cloudflare/next-on-pages, ani jakiegokolwiek kodu czytającego SKIP_CF_BINDINGS. next.config.ts nie zawiera żadnego "fixu", o którym mówi komentarz. Faktyczny deployment (potwierdzony w AGENTS.md) to Docker + nginx na VPS, z Cloudflare wyłącznie jako CDN/cache (jest tylko krok "purge cache"). To ślad porzuconej ścieżki wdrożenia (Workers), po której zostały nieaktualne artefakty w 3 miejscach.
Rekomendacja: Usunąć z README wzmiankę "Cloudflare Workers/Pages ready" i z tech-stacku "Cloudflare Workers support", albo faktycznie zaimplementować tę ścieżkę. Usunąć nieużywaną zmienną SKIP_CF_BINDINGS z docker-compose-dev.yml i martwy komentarz. Usunąć z AGENTS.md wzmianki o .dev.vars/.wrangler/, jeśli Workers nie są w planach.
Szacowany nakład: S
```

---

## 2. Architektura i struktura kodu

Podział `app/ → components/ → hooks/ → lib/ → context/` jest przestrzegany konsekwentnie. Nie znaleziono logiki biznesowej "wyciekającej" do route handlerów ani zapytań/parsowania rozsianych po komponentach — parsowanie SRT/VTT, operacje na napisach i metryki żyją w `lib/`. Nie znaleziono cykli zależności ani zduplikowanych wersji tej samej funkcji (`fooV2`/`foo_old` itp.) — to mocna strona projektu.

```
[PRIORYTET: Niski] Główny plik stanu globalnego ma 630 linii i łączy 6 kontekstów w jednym pliku
Lokalizacja: context/subtitle-context.tsx (całość, 630 linii)
Opis: Plik definiuje 6 osobnych React Context (SubtitleState, SubtitleActions, SubtitleHistory, SubtitleData, SubtitleTiming, LocalSession) plus 4 bloki useEffect obsługujące autosave/sync. Sam podział na 6 kontekstów jest świadomym i sensownym wzorcem (ograniczenie zbędnych re-renderów — potwierdzone w AGENTS.md), więc to NIE jest "boży obiekt" w sensie architektonicznym. Problem jest czysto plikowy: 630 linii w jednym pliku utrudnia nawigację, zwiększa ryzyko konfliktów mergowania i sprawia, że każda zmiana w jednym kontekście dotyka pliku odpowiedzialnego też za pozostałe 5.
Rekomendacja: Rozbić plik na katalog context/subtitle/ z osobnymi plikami per kontekst (state.tsx, actions.tsx, history.tsx, data.tsx, timing.tsx, local-session.tsx) i plikiem index.tsx re-eksportującym publiczne API — bez zmiany samej logiki ani granic odpowiedzialności, które już są dobrze zaprojektowane.
Szacowany nakład: M
**WDROZONE**
```

```
[PRIORYTET: Niski] editor-app.tsx jako centralny orkiestrator kilku niezależnych przepływów
Lokalizacja: components/editor/editor-app.tsx (558 linii, 4 useEffect: odzyskiwanie sesji lokalnej, ładowanie współdzielonego pliku, auto-load z Vimeo, guard przed zamknięciem karty)
Opis: Plik łączy cztery w większości niezależne przepływy inicjalizacji (local-session-recovery, load-shared, vimeo auto-load z ?vimeo_id, before-unload guard). Logika samych operacji jest już wydzielona do hooków (use-subtitle-file-loader, use-media-file itd.), więc to głównie "klej" — mniej poważne niż typowy god-file, ale wciąż najbardziej ruchliwy plik w historii commitów (3 z 5 ostatnich commitów go dotyczą), co wskazuje na rosnącą złożoność w jednym miejscu.
Rekomendacja: Wydzielić każdy z 4 useEffect do własnego hooka (np. use-shared-file-autoload, use-vimeo-autoload) tak, jak zrobiono to już dla innych przepływów w hooks/. Niski priorytet — nie blokuje niczego dziś.
Szacowany nakład: S
```

---

## 3. Ślady wielokrotnych poprawek ("łatania")

Kod jest w tym zakresie wyjątkowo czysty jak na projekt aktywnie rozwijany: **jeden** komentarz `hacky` (`waveform-visualizer/utils.ts:56`, uczciwie opisujący ograniczenie API wavesurfer.js, nie realny dług), zero `TODO/FIXME/HACK/XXX` w kodzie źródłowym, zero zduplikowanych wersji funkcji, zero pustych `catch {}` poza jednym uzasadnionym przypadkiem (patrz sekcja 4). `package.json` nie ma sprzecznych zależności (nie ma np. `moment` + `dayjs`).

Jeden konkretny ślad "łatania" wart odnotowania:

```
[PRIORYTET: Niski] Rozjazd dokumentacji AGENTS.md z faktycznym stanem konfiguracji
Lokalizacja: AGENTS.md ("Known Issues") vs eslint.config.js; AGENTS.md ("Tech Stack") vs messages/*.json
Opis: AGENTS.md twierdzi, że reguła react-hooks/set-state-in-effect jest wyłączona dla "10 specific files" — eslint.config.js wyłącza ją realnie dla 11 plików (policzono bezpośrednio z tablicy files w konfiguracji). AGENTS.md w sekcji Tech Stack wymienia i18n jako "4 locales: en, de, pl, yue", podczas gdy messages/ zawiera 13 plików lokalizacji (ar, bn, de, en, es, fr, hi, mr, pl, pt, ru, yue, zh), co potwierdza też README. To dowód, że AGENTS.md (dokument służący też jako kontekst dla narzędzi AI wspomagających rozwój) nie jest aktualizowany przy każdej zmianie — realne ryzyko, że kolejne "poprawki" będą bazować na nieaktualnym obrazie projektu.
Rekomendacja: Zaktualizować oba fragmenty AGENTS.md. Rozważyć wygenerowanie sekcji "locales" i "tech stack" automatycznie (skrypt czytający messages/ i package.json) zamiast ręcznego utrzymywania.
Szacowany nakład: S
**WDROZONE**
```

---

## 4. Jakość kodu i utrzymywalność

Konfiguracja lint/format jest nietypowo dojrzała jak na projekt tej wielkości: ESLint (`eslint-config-next/core-web-vitals`, `--max-warnings=0`) odpowiada wyłącznie za jakość kodu, Biome wyłącznie za formatowanie (`"linter": { "enabled": false }` w `biome.json`) — świadomy podział odpowiedzialności, bez nakładających się reguł. TypeScript w trybie `strict: true`. Walidacja wejścia w API route'ach oparta jest o regexy ad-hoc (nie Zod/Joi) — akceptowalne przy tak małej liczbie endpointów, ale patrz sekcja 5 co do realnej skuteczności tych walidacji.

```
[PRIORYTET: Średni] Krok CI "format" wykonuje auto-fix przed krokiem "format:check", więc bramka formatowania nigdy nie może zawieść
Lokalizacja: .github/workflows/ci.yml:16-20 (kroki `npm run format` → `npm run format:check`)
Opis: `npm run format` to `biome format --write .` — zapisuje poprawki na dysku runnera CI. Kolejny krok, `npm run format:check`, sprawdza zgodność z formatowaniem Biome — ale skoro poprzedni krok właśnie je wymusił, `format:check` fizycznie nie może wykryć niesformatowanego kodu w PR-ze. Bramka jakości istnieje na papierze, ale nie chroni gałęzi `main` przed niesformatowanymi commitami — CI "naprawia i cicho przepuszcza", zamiast odrzucić PR z prośbą o poprawienie przez autora.
Rekomendacja: Usunąć krok `npm run format` z CI (auto-fix ma sens lokalnie/pre-commit, nie w gałęzi weryfikującej) i zostawić tylko `npm run format:check` jako właściwą bramkę.
Szacowany nakład: S
**WDROZONE**
```

```
[PRIORYTET: Niski] Niespójne logowanie: część plików pomija wrapper warnDev/errorDev
Lokalizacja: components/editor/editor-app.tsx:203,234,330; lib/audio-peaks.ts:95,108; app/api/load-captions/route.ts:50; app/api/load-shared/route.ts:50
Opis: Projekt ma dedykowany wrapper lib/log.ts (warnDev/errorDev), który wycisza logi w produkcji — używany w 6 plikach (video-player.tsx, waveform-visualizer, service-worker-register.tsx, hooks). Równolegle 5 innych plików woła surowe console.error/console.warn, które w komponentach klienckich (editor-app.tsx, audio-peaks.ts) będą widoczne w konsoli przeglądarki użytkownika produkcyjnego, mimo istnienia mechanizmu temu zapobiegającego. W route'ach API (load-captions, load-shared) surowy console.error po stronie serwera jest natomiast poprawny i pożądany — nie powinien być zmieniany na errorDev.
Rekomendacja: Ujednolicić logowanie w komponentach klienckich (editor-app.tsx, audio-peaks.ts) do warnDev/errorDev; route'y API (server-side) zostawić bez zmian, ewentualnie dodać do nich kontekst (np. nazwę endpointu) w logu.
Szacowany nakład: S
**WDROZONE**
```

Nie znaleziono niezłapanych Promise ani ewidentnego blokowania event loopa. Jedyny pusty `catch` (`components/video-player.tsx:175`, `playPromise.catch(() => {})`) to rozpoznany, akceptowalny wzorzec tłumienia `AbortError` z `HTMLMediaElement.play()` — bez zastrzeżeń poza sugestią dodania komentarza wyjaśniającego.

Typowanie (`any`) jest skoncentrowane niemal wyłącznie w jednym miejscu:

```
[PRIORYTET: Niski] any skoncentrowane w warstwie parsowania MP4 (mp4box)
Lokalizacja: lib/audio-peaks.ts:23,24,76,117,134,171,228 (7 z 8 wystąpień `any` w całym repo)
Opis: Biblioteka mp4box.js nie ma kompletnych typów TS, więc granica integracji z nią jest otypowana jako `any` (callback-i onReady/onSamples/onError, bufory). To akurat najbardziej złożony i najświeższy fragment aplikacji (streaming parser dla plików 1GB+), więc brak bezpieczeństwa typów jest tam, gdzie błąd byłby najkosztowniejszy.
Rekomendacja: Napisać minimalny plik deklaracji typów (`types/mp4box.d.ts`) pokrywający używane pola API mp4box zamiast `any` — nie wymaga migracji całej biblioteki, tylko lokalnego "faceted" typowania na granicy integracji.
Szacowany nakład: S
```

---

## 5. Bezpieczeństwo

To sekcja z realnym, uzasadnionym ryzykiem produkcyjnym — dwa poniższe znaleziska są potwierdzone bezpośrednio w kodzie, nie są spekulacją.

```
[PRIORYTET: Krytyczny] Middleware SSO nie obejmuje żadnego route'u /api — cała autoryzacja jest omijana
Lokalizacja: proxy.ts:93-95 (matcher config)
Opis: Middleware proxy.ts wykonuje weryfikację ciasteczka SSO (verifySso) i dopiero potem przekazuje żądanie do next-intl. Ale `config.matcher` to `["/((?!_next|api|faq|offline|.*\\..*).*)"]` — negative lookahead jawnie wyklucza wszystko zaczynające się od `api`. W Next.js middleware w ogóle nie jest wywoływane dla ścieżek pasujących do wykluczenia z matchera — nie chodzi o to, że weryfikacja SSO "przepuszcza" żądania do /api, tylko że nigdy nie jest dla nich uruchamiana. Efekt: WSZYSTKIE trzy route'y API (`/api/vimeo/download`, `/api/load-captions`, `/api/load-shared`) są w pełni dostępne bez żadnego uwierzytelnienia, mimo że README opisuje "SSO authentication — HMAC-signed SSO cookie verification for access control" jako funkcję całej aplikacji. Matcher prawdopodobnie miał tylko wyłączyć middleware next-intl (i18n routing) dla API, ale przy okazji wyłączył też bramkę SSO, bo obie logiki są połączone w jednej funkcji `proxy()`.
Konsekwencje: (1) `/api/vimeo/download?url=...` używa firmowego `VIMEO_ACCESS_TOKEN` do pobrania i streamowania DOWOLNEGO wideo po ID/URL, bez limitu i bez uwierzytelnienia — każdy w internecie może wykorzystać płatny token API organizacji jako otwarty proxy do pobierania wideo z Vimeo (w tym potencjalnie treści nieprzeznaczonych do publicznego dostępu, jeśli token ma do nich uprawnienia), zużywając limity API i transfer. (2) `/api/load-captions` i `/api/load-shared` ujawniają pliki napisów bez autoryzacji — nawet przy poprawnej walidacji ścieżek (patrz niżej) to wciąż odczyt danych, które SSO miało chronić.
Rekomendacja: Zmienić matcher tak, by middleware SSO uruchamiał się też dla /api (osobna reguła matchera dla i18n vs. dla auth, bo to różne wymagania), ALBO dodać jawną weryfikację SSO wewnątrz każdego route handlera w app/api/. To drugie jest bezpieczniejsze (nie polega na konfiguracji matchera w jednym miejscu) — wydzielić verifySso z proxy.ts do lib/sso.ts i wywoływać na starcie każdego route handlera.
Szacowany nakład: S
**WDROZONE**
```

```
[PRIORYTET: Krytyczny] DOM XSS: tekst napisów trafia do innerHTML bez sanityzacji
Lokalizacja: components/waveform-visualizer/utils.ts:13-45 (createSubtitleRegionContent), wywoływane z renderRegionContent, createRegionForSubtitle, syncRegionForSubtitle
Opis: `subtitle.text` — czyli surowy tekst wpisu napisów, w pełni kontrolowany przez zawartość wczytanego pliku .srt/.vtt — jest wstawiany bezpośrednio do `content.innerHTML` przez template string, bez żadnego escapowania HTML. Pliki napisów mogą pochodzić nie tylko z ręcznego wgrania przez użytkownika, ale też z parametrów URL obsługiwanych przez aplikację (`?caption=`, `/api/load-shared`, `/api/load-captions`) i z napisów pobieranych z Vimeo — czyli z treści, które mogą pochodzić od innej osoby niż ta, która ostatecznie otwiera stronę. Wpis napisów zawierający np. `<img src=x onerror=...>` wykona się jako żywy DOM w chwili renderowania regionu na waveformie. To jedyne miejsce w kodzie, gdzie tekst napisów omija automatyczne escapowanie Reacta (główna lista napisów w components/subtitle/ renderuje tekst przez JSX/edytor, co jest bezpieczne) — problem dotyczy wyłącznie nakładki na waveformie, bo wavesurfer.js wymaga surowego HTMLElement, a nie komponentu React.
Rekomendacja: Nie budować znacznika przez innerHTML z interpolowanym tekstem użytkownika. Zamiast tego utworzyć elementy DOM dla czasu i tekstu osobno i przypisać treść przez `textContent` (bezpieczne z definicji), zostawiając innerHTML tylko dla statycznego szkieletu HTML bez zmiennych.
Szacowany nakład: S
**WDROZONE**
```

```
[PRIORYTET: Wysoki] Brak rate limitingu na endpointach API — szczególnie krytyczne dla /api/vimeo/download
Lokalizacja: app/api/vimeo/download/route.ts, app/api/load-captions/route.ts, app/api/load-shared/route.ts (całościowo)
Opis: Żaden route nie ma ograniczenia liczby żądań. Trasa `/api/vimeo/download` pozwala na automatyczne przeiterowanie po ID wideo Vimeo i pobranie całej biblioteki organizacji przy użyciu jej płatnego tokena, bez żadnego throttlingu. Nawet po naprawieniu luki z SSO, rate limiting jest sensowną warstwą dodatkową (obrona w głąb) dla endpointu, który wykonuje kosztowne żądania wychodzące do zewnętrznego API w imieniu serwera.
Rekomendacja: Dodać prosty rate limiting (np. per-IP, w pamięci lub w edge/nginx) na /api/vimeo/download.
Szacowany nakład: S
**WDROZONE w nginx**
```

```
[PRIORYTET: Niski] Brak nagłówków bezpieczeństwa (CSP itp.) ustawianych po stronie aplikacji
Lokalizacja: next.config.ts (całość), public/_headers (tylko Cache-Control dla /_next/static/*)
Opis: Aplikacja sama nie ustawia Content-Security-Policy, X-Frame-Options, Referrer-Policy ani podobnych nagłówków — ani w next.config.ts (brak sekcji `headers()`), ani w public/_headers. Biorąc pod uwagę, że projekt renderuje treść przez innerHTML w jednym miejscu (patrz wyżej), CSP byłby realną warstwą obronną ograniczającą skutki takiej podatności. Nie sprawdzono konfiguracji nginx/Cloudflare (leżą poza tym repozytorium, w ~/containers/ — patrz sekcja 10), więc możliwe, że nagłówki są ustawiane tam; nie da się tego potwierdzić z poziomu repo.
Rekomendacja: Dodać przynajmniej podstawowy CSP i standardowe nagłówki bezpieczeństwa w next.config.ts (`headers()` callback) niezależnie od tego, co robi warstwa nginx/CF — nie polegać wyłącznie na infrastrukturze poza repo. Zweryfikować obecną konfigurację nginx.
Szacowany nakład: S
```

Pozytywna obserwacja: walidacja ścieżek w `load-captions` i `load-shared` (regex + blokada `..` + `path.resolve` + `startsWith(baseDir)`) jest w praktyce skuteczna przeciw path traversal — to nie jest problem tej klasy. `npm audit` (dependencies + devDependencies) zwraca **0 znanych podatności** — pozytyw.

---

## 6. Zależności i środowisko

Spójność wersji Node.js jest wzorcowa: `.nvmrc` (24.18.0), `package.json engines` (`>=24`), oba Dockerfile (`node:24-alpine`) i CI (`node-version-file: .nvmrc`) są zgodne — brak rozjazdu, który często bywa źródłem "działa u mnie". Node 24 nie jest wersją EOL. Zależności są aktualne: dla wszystkich paczek w `package.json` "Wanted" pokrywa się z "Latest" wg rejestru npm (sprawdzone `npm outdated`), bez zaległych majorów. `npm audit` — 0 podatności. Brak nadmiarowych/konkurencyjnych bibliotek w `package.json` (np. nie ma równoległych bibliotek dat, ikon czy HTTP).

```
[PRIORYTET: Niski] Konfiguracja produkcyjna Dockera żyje całkowicie poza repozytorium
Lokalizacja: AGENTS.md ("Production compose file is at ~/containers/compose.yml (NOT in this repo)"), "Nginx Configuration: ~/containers/nginx/sites/subtitle-editor.amruta.org.conf"
Opis: Faktyczny plik compose używany do wdrożenia produkcyjnego oraz konfiguracja nginx nie są wersjonowane w tym repozytorium — istnieją tylko lokalnie na serwerze/maszynie administratora. Przy projekcie utrzymywanym przez jedną osobę to realne ryzyko operacyjne: utrata dostępu do tej jednej maszyny (awaria, zmiana sprzętu) oznacza utratę configu wdrożeniowego bez kopii w git. docker-compose-dev.yml w repo też ma zahardkodowaną, specyficzną dla maszyny ścieżkę hosta (`/home/admin/git/captions:/app/captions:ro`), co jest tego samego rodzaju problemem w mniejszej skali.
Rekomendacja: Zversjonować docker-compose.prod.yml i konfigurację nginx (choćby w osobnym prywatnym repo infra, jeśli nie w tym), z wartościami specyficznymi dla środowiska wyciągniętymi do zmiennych/`.env`, nie do literałów w pliku.
Szacowany nakład: M
```

---

## 7. Testy

Pokrycie logiki czystej (`lib/`) jest solidne i realne, nie na pokaz — sprawdzono liczbę asercji per plik testowy: `subtitle-context.test.ts` (68 asercji / 514 linii), `subtitle-metrics.test.ts` (55), `load-captions.test.ts` (21), `local-session.test.ts` (20) itd. — to nie są testy złożone wyłącznie z mocków bez sprawdzeń. Parsowanie SRT/VTT, operacje na wielu ścieżkach czasowych i logika undo/redo mają realne przypadki brzegowe pokryte testami.

```
[PRIORYTET: Wysoki] Zero testów dla warstwy autoryzacji (proxy.ts) i realnych route handlerów API
Lokalizacja: brak plików testowych dla proxy.ts, app/api/vimeo/download/route.ts, app/api/load-captions/route.ts, app/api/load-shared/route.ts
Opis: Najbardziej wrażliwy bezpiecznościowo kod w repozytorium (weryfikacja HMAC w proxy.ts, trzy route'y API) nie ma ŻADNEGO testu. Jedyny test dotykający tego obszaru, tests/vimeo.test.ts, nie importuje niczego z route.ts — kopiuje funkcję extractVideoId 1:1 do pliku testowego (patrz kolejne znalezisko) i testuje tę kopię, nie prawdziwy kod produkcyjny. To bezpośrednio koreluje z dwoma krytycznymi lukami z sekcji 5: gdyby proxy.ts i route'y API miały testy integracyjne sprawdzające "żądanie bez ciasteczka SSO do /api/... powinno zostać odrzucone", luka zostałaby wykryta przed wdrożeniem, a nie przez audyt.
Rekomendacja: Dodać testy integracyjne wywołujące bezpośrednio wyeksportowane funkcje GET z każdego route.ts z mockowanym NextRequest (z i bez ciasteczka SSO, z poprawnym i niepoprawnym podpisem HMAC), oraz testy jednostkowe dla verifySignature/verifySso z proxy.ts. Priorytet: napisać je RÓWNOLEGLE z naprawą luki z sekcji 5, jako dowód, że fix faktycznie działa.
Szacowany nakład: M
**WDROZONE**
```

```
[PRIORYTET: Średni] Test dubluje logikę zamiast importować prawdziwy kod
Lokalizacja: tests/vimeo.test.ts:8-17 vs app/api/vimeo/download/route.ts:3-17 (funkcja extractVideoId)
Opis: Funkcja extractVideoId nie jest eksportowana z route.ts, więc test nie może jej zaimportować — zamiast tego kopiuje jej ciało 1:1 do pliku testowego. Test przechodzi niezależnie od tego, czy prawdziwa funkcja w route.ts działa poprawnie: jeśli ktoś zmieni regex w route.ts i zapomni zsynchronizować kopię w teście (albo odwrotnie), testy dalej będą zielone, dając fałszywe poczucie bezpieczeństwa. To klasyczny "test na pokaz" — sprawdza coś, ale nie to, co faktycznie działa w produkcji.
Rekomendacja: Wydzielić extractVideoId do lib/vimeo-url.ts, zaimportować zarówno w route.ts, jak i w teście. Przy okazji ujednolica to z komentarzem w route.ts, który już mówi "shared logic between client and API route" — sugerując, że współdzielenie było zamierzone, ale nie zostało dokończone.
Szacowany nakład: S
**WDROZONE**
```

Krytycznych ścieżek biznesowych parsowania/edycji napisów bez testów nie znaleziono — to obszar dobrze pokryty. Luka dotyczy wyłącznie brzegu API/auth opisanego wyżej.

---

## 8. Wydajność

Analiza statyczna bez profilowania runtime ma tu ograniczoną moc dowodową — poniższe to obserwacje z przeglądu kodu, nie zmierzone metryki.

Warstwa streamingu dużych plików (`lib/audio-peaks.ts`, mp4box + Web `AudioDecoder`, chunki 5MB) jest zaprojektowana świadomie pod kątem wydajności — README wprost opisuje unikanie ładowania całego pliku do pamięci dla wideo 1GB+, co jest właściwym podejściem dla tego przypadku użycia. Autosave sesji lokalnej ma debounce 750ms (`lib/local-session.ts`) — rozsądna wartość zapobiegająca nadmiarowym zapisom do `localStorage`. Nie znaleziono w przeglądzie oczywistych operacji synchronicznych blokujących event loop ani niezamykanych listenerów/timerów w hookach cyklu życia (`useEffect` mają cleanupy tam, gdzie widziano subskrypcje).

```
[PRIORYTET: Niski] Brak testów/pomiarów wydajności — sekcja wymaga profilowania runtime, którego audyt statyczny nie dostarcza
Lokalizacja: całościowo
Opis: Nazwa tests/performance-multitrack.test.ts sugeruje istnienie testu wydajnościowego, ale to test funkcjonalny (poprawność przy wielu ścieżkach), nie pomiar czasu/pamięci. Rzeczywiste wąskie gardła (np. częstotliwość przebudowy regionów waveformu przy edycji, koszt re-renderu przy dużej liczbie napisów) wymagałyby profilowania w przeglądarce (React DevTools Profiler, Performance tab) na pliku rzędu setek napisów / wideo 1GB+, czego nie da się wiarygodnie ocenić samym czytaniem kodu.
Rekomendacja: Jeśli wydajność przy dużych plikach jest priorytetem biznesowym (README to sugeruje), przeprowadzić osobną sesję profilowania z realnym plikiem 1GB+ i kilkuset napisami, zamiast wnioskować z kodu.
Szacowany nakład: M
```

---

## 9. Logowanie i observability

Aplikacja jest front-end-first bez własnego backendu poza trzema wąskimi route'ami, więc klasyczne "metryki/health checki" w rozumieniu backendowym mają tu mniejsze zastosowanie niż w typowym serwisie API — to nie jest per se brak, tylko naturalna konsekwencja architektury. Logowanie klienckie ma dedykowany wrapper (`lib/log.ts`) wyciszający logi w produkcji, ale stosowany niekonsekwentnie (patrz sekcja 4).

```
[PRIORYTET: Niski] Brak endpointu health-check mimo wdrożenia w Dockerze za nginx
Lokalizacja: app/api/ (brak /api/health), Dockerfile.prod, docker-compose-dev.yml
Opis: Aplikacja jest wdrażana jako długożyjący kontener Docker za reverse proxy (nginx), ale nie eksponuje żadnego lekkiego endpointu healthcheck do automatycznego monitorowania stanu procesu Next.js (odróżnienie "kontener działa" od "aplikacja faktycznie odpowiada"). Ani Dockerfile.prod, ani docker-compose nie definiują HEALTHCHECK.
Rekomendacja: Dodać prosty app/api/health/route.ts zwracający 200 i podłączyć go jako HEALTHCHECK w Dockerfile.prod / docker-compose, żeby orkiestrator (lub choćby ręczny monitoring) mógł odróżnić żywy proces od zawieszonego.
Szacowany nakład: S
```

---

## 10. Dokumentacja i DX

To mocna strona projektu. README jest konkretny, aktualny w większości treści i jasno rozdziela cechy odziedziczone od forka od cech dodanych. AGENTS.md jest wyjątkowo dobrym artefaktem DX — zawiera pełną mapę katalogów, konwencje nazewnictwa, workflow weryfikacji przed PR-em, a nawet sekcję "Do Not Touch" tłumaczącą, których plików nie ruszać i dlaczego. Nowy developer (lub agent AI) realnie mógłby ogarnąć projekt bez pytania autora — poza rozjazdami opisanymi w sekcjach 1 i 3 (locale, liczba plików z wyłączoną regułą ESLint, wzmianki o Cloudflare Workers).

```
[PRIORYTET: Niski] components.json odwołuje się do nieistniejącego tailwind.config.ts
Lokalizacja: components.json, potwierdzone samoświadomie w AGENTS.md ("Known Issues")
Opis: Standardowy plik konfiguracyjny shadcn/ui (components.json) wskazuje na tailwind.config.ts, który nie istnieje — Tailwind v4 używa konfiguracji w CSS (app/globals.css). To już udokumentowany, znany problem (opisany wprost w AGENTS.md jako "stale shadcn/ui config artifact"), więc nie jest to nowe odkrycie audytu — odnotowuję dla kompletności, bez dodatkowej rekomendacji ponad to, co zespół już wie.
Rekomendacja: Brak nowej rekomendacji — zespół świadomie zdecydował się to zostawić. Warto tylko upewnić się, że decyzja jest nadal aktualna przy kolejnej aktualizacji shadcn/ui CLI (może zacząć wymagać tego pliku).
Szacowany nakład: S
```

---

## Top 10 najpilniejszych działań

Posortowane: priorytet, a przy równym priorytecie — mniejszy nakład wyżej.

| # | Działanie | Priorytet | Nakład |
|---|---|---|---|
| 1 | ~~Naprawić matcher middleware (proxy.ts), by SSO obejmowało też /api, LUB dodać jawną weryfikację SSO w każdym route handlerze~~ | Krytyczny | S |
| 2 | ~~Usunąć innerHTML z interpolowanym tekstem napisów w waveform-visualizer/utils.ts (użyć textContent)~~ | Krytyczny | S |
| 3 | ~~Dodać rate limiting na /api/vimeo/download (obrona w głąb, niezależnie od #1)~~ | Wysoki | S |
| 4 | ~~Dodać testy integracyjne dla proxy.ts i trzech route'ów API (bez cookie / złe HMAC / poprawne HMAC)~~ | Wysoki | M |
| 5 | ~~Wydzielić extractVideoId do lib/ i zaimportować w route.ts oraz w teście zamiast duplikować~~ | Średni | S |
| 6 | ~~Usunąć krok `npm run format` (auto-fix) z CI, zostawić tylko `format:check` jako realną bramkę~~ | Średni | S |
| 7 | ~~Uporządkować martwe odwołania do Cloudflare Workers (README, AGENTS.md, docker-compose) zgodnie z faktycznym Docker+nginx~~ | Średni | S |
| 8 | ~~Ujednolicić logowanie w komponentach klienckich do warnDev/errorDev (editor-app.tsx, audio-peaks.ts)~~ | Niski | S |
| 9 | ~~Zsynchronizować AGENTS.md z rzeczywistością (liczba locale, liczba plików z wyłączoną regułą ESLint)~~ | Niski | S |
| 10 | ~~Rozbić context/subtitle-context.tsx na osobne pliki per kontekst, zachowując istniejący podział logiczny~~ | Niski | M |

---

## Ogólna ocena stanu projektu: 7/10

**Uzasadnienie.** Dyscyplina inżynierska jest wyraźnie ponadprzeciętna jak na projekt tej skali: TypeScript w trybie strict, świadomy rozdział ESLint (jakość) / Biome (formatowanie), Dependabot, CI z pięcioma bramkami jakości, spójne wersje Node w całym stacku (.nvmrc/engines/Docker/CI), zero podatności w `npm audit`, oraz testy jednostkowe, które faktycznie sprawdzają logikę (nie są "na pokaz") w warstwie parsowania i stanu. Git nie pokazuje śladów wieloletniego chaosu — bo go po prostu nie ma.

To, co ściąga ocenę w dół, to nie nagromadzony dług, tylko dwa konkretne, świeże i poważne błędy bezpieczeństwa (luka w matcherze middleware wyłączająca SSO dla całego /api; DOM XSS przez innerHTML) — oba leżą dokładnie w tej części kodu (integracja Vimeo, SSO), która jest najmłodsza i najmniej pokryta testami. To typowy wzorzec dla szybko dodawanych funkcji: reszta projektu jest solidna, ale nowy, wrażliwy fragment nie dostał jeszcze tego samego poziomu rygoru co reszta. Naprawa obu jest tania (S/S) i powinna nastąpić przed jakimkolwiek innym punktem z listy.

---

## Sugerowana kolejność refaktoryzacji

1. ~~**Najpierw testy, potem fix.**~~ WDROZONE (#4, #5)
2. ~~**Naprawić matcher/middleware (#1) i XSS w waveform-visualizer (#2) równolegle**~~ WDROZONE (#1, #2)
3. ~~**Dodać rate limiting (#3) i doprecyzować testy (#4, #5)**~~ WDROZONE (#3, #4, #5)
4. **Porządki proceso-dokumentacyjne (#8, #9)** — zero ryzyka, można robić w dowolnej kolejności, dobrze nadają się jako "filler" commity między większymi zmianami.
5. **Na końcu refaktor pliku context/subtitle-context.tsx (#10)** — celowo na końcu: to zmiana czysto organizacyjna (przenoszenie kodu między plikami, bez zmiany logiki), więc najlepiej zrobić ją, gdy inne zmiany funkcjonalne już wylądowały na main, żeby uniknąć wielogodzinnych konfliktów mergowania w najczęściej edytowanym pliku projektu.
