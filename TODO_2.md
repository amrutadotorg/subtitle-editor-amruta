# Audyt techniczny: subtitle-editor-amruta (aktualizacja)

**Repozytorium:** github.com/amrutadotorg/subtitle-editor-amruta
**Commit audytowany:** `9faeb9e` (main, stan na 2026-07-19)
**Zakres:** analiza statyczna kodu i konfiguracji, historia Git, `npm audit`/`npm outdated`, faktyczne uruchomienie testów (`npm run test` — 191/191 zielone) i lintera (`npm run lint` — 0 ostrzeżeń). Bez uruchamiania aplikacji w przeglądarce i bez profilowania runtime.

---

## Uwaga metodologiczna — w repozytorium jest już gotowy audyt

Zanim przejdę do wyników: w repozytorium istnieje plik `TODO.md`, który jest audytem technicznym tego samego projektu, wykonanym wg identycznej metodologii, datowanym na 2026-07-18 (commit `a7ec5d6`). Commit audytowany tam jest **9 commitów starszy** niż obecny HEAD. Traktuję to jako punkt wyjścia, nie jako coś do zignorowania — poniższy raport jest w dużej mierze audytem **delty**: sprawdzam, czy zalecenia z `TODO.md` zostały faktycznie i poprawnie wdrożone (a nie tylko oznaczone jako `WDROZONE`), oraz szukam tego, co nowe albo pominięte.

Zweryfikowałem bezpośrednio w kodzie (nie tylko na podstawie adnotacji w `TODO.md`) następujące wdrożenia z poprzedniego audytu:

| Poprzednie znalezisko (`TODO.md`) | Status po weryfikacji |
|---|---|
| Krytyczna: middleware SSO pomija `/api` (matcher wyklucza całą ścieżkę) | **Naprawione poprawnie** — `proxy.ts` nadal wyklucza `/api` z matchera, ale każdy z 3 route handlerów (`load-captions`, `load-shared`, `vimeo/download`) woła teraz `verifySsoApi(request)` na starcie. To bezpieczniejszy z dwóch wariantów rekomendowanych w `TODO.md`. Patrz jednak nowe znalezisko w sekcji 5 — ten fix ma ukryty koszt procesowy. |
| Krytyczna: DOM XSS przez `innerHTML` w `waveform-visualizer/utils.ts` | **Naprawione poprawnie** — `createSubtitleRegionContent` buduje teraz DOM przez `createElement`/`textContent`, zero interpolacji tekstu użytkownika do `innerHTML`. |
| Wysoki: zero testów dla `proxy.ts`/route handlerów API | **Naprawione, i to solidnie** — `tests/api-routes.test.ts` i `tests/proxy-middleware.test.ts` testują realny HMAC (bez cookie, złe HMAC, wygasła sesja, poprawne HMAC) wywołując bezpośrednio wyeksportowane `GET` z prawdziwych plików route, nie kopie. |
| Średni: `extractVideoId` duplikowany w teście zamiast importowany | **Naprawione** — wydzielony do `lib/vimeo-url.ts`, importowany zarówno w `route.ts`, jak i w `tests/vimeo.test.ts`. |
| Średni: krok CI `format` (auto-fix) unieważnia `format:check` | **Naprawione** — w `.github/workflows/ci.yml` został tylko `npm run format:check`. |
| Niski: niespójne logowanie (`console.*` zamiast `warnDev`/`errorDev`) | **Naprawione** w plikach klienckich (`editor-app.tsx`, `audio-peaks.ts`); server-side `console.error` w route'ach API pozostawiony słusznie bez zmian. |
| Niski: `AGENTS.md` rozjechany z rzeczywistością (liczba locale, liczba plików z wyłączoną regułą ESLint) | **Naprawione i zgodne** — sprawdziłem osobiście: `eslint.config.js` wyłącza `react-hooks/set-state-in-effect` dla 11 plików, `AGENTS.md` mówi "11 specific files" (wcześniej było rozjechane 10 vs 11). Locale: 13 plików w `messages/`, `AGENTS.md` mówi "13 locales" w dwóch miejscach. |
| Niski: martwe odwołania do Cloudflare Workers/Pages (README, AGENTS.md, docker-compose) | **Posprzątane** — jedyna pozostała wzmianka o Cloudflare to legitna, opisowa linia "Purge Cloudflare cache" w `AGENTS.md` (CDN, nie Workers). |
| Niski: `context/subtitle-context.tsx` (630 linii, 6 kontekstów) rozbity na katalog | **Wdrożone** — `context/subtitle/` z osobnymi plikami (`state.tsx`, `actions.tsx`, `history.tsx`, `data.tsx`, `timing.tsx`, `local-session.tsx`, `provider.tsx`, `index.tsx`), zgodnie z opisem. |
| Wysoki: rate limiting na `/api/vimeo/download` | Oznaczone `WDROZONE w nginx` — **niemożliwe do zweryfikowania z tego repozytorium** (config nginx żyje poza repo, patrz `AGENTS.md`). Nie znajduję w repo żadnego dowodu (ani testu, ani dokumentacji z konkretną regułą), że to istnieje. Patrz sekcja 5. |
| Niski: brak nagłówków CSP | **Nadal otwarte**, bez zmian — patrz sekcja 5. |
| Niski: `mp4box` — `any` skoncentrowane w `lib/audio-peaks.ts` | **Nadal otwarte**, bez zmian (zweryfikowałem: 7 z 8 rzeczywistych wystąpień `: any`/`as any` w repo nadal tam). |
| Niski: brak health-check endpointu | **Nadal otwarte** — brak `HEALTHCHECK` w obu Dockerfile i brak `/api/health`. |
| Niski: konfiguracja produkcyjna Dockera/nginx poza repo | **Nadal otwarte**, bez zmian. |
| Niski: `components.json` → nieistniejący `tailwind.config.ts` | Świadomie pozostawione (udokumentowane w `AGENTS.md` jako "Known Issue") — bez zmian, zgodnie z decyzją zespołu. |

**Wniosek z weryfikacji:** to nie jest audyt kosmetyczny ani "audyt na pokaz" — wszystkie 3 wysokie/krytyczne pozycje zostały naprawione merytorycznie poprawnie, z testami dowodzącymi fixa, nie tylko deklaratywnie. To rzadkie i warte odnotowania jako pozytyw sam w sobie.

Poniżej pełny raport wg wymaganej struktury, skoncentrowany na tym, co nowe, niezweryfikowane lub pominięte — nie powielam already-confirmed pozycji z tabeli powyżej jako osobnych znalezisk.

---

## 1. Rozpoznanie projektu

Next.js 16 (App Router) + React 19 + TypeScript 6 (`strict: true`), Node ≥24. Uruchamianie: `next dev --turbopack` (dev), `next build --output=standalone` + `next start` (prod). Wdrożenie: Docker (dev/prod profile w `docker-compose-dev.yml`) za nginx, Cloudflare jako CDN przed nginx. Trzy domeny: (1) edycja napisów w przeglądarce (offline-first PWA), (2) import wideo z Vimeo przez proxy API, (3) SSO oparte o ciasteczko HMAC wystawiane przez WordPress (`amruta.org`).

Historia Git (46 commitów, 2026-07-11 → 2026-07-19, jeden główny autor + dependabot) potwierdza to, co już ustalił poprzedni audyt: to młody, aktywnie rozwijany fork (`subtitle-editor` by @laubonghaudoi), nie wieloletni projekt legacy. Założenie z promptu audytowego o "długim rozwoju i wielokrotnym łataniu" w dalszym ciągu się nie potwierdza w sensie git-blame — natomiast potwierdza się w innym, ciekawszym sensie: sam ten projekt w ciągu 9 commitów przeszedł pełny cykl "audyt → naprawa → dowód naprawy testami", co jest dokładnie tym wzorcem szybkiego, iteracyjnego łatania, o który pytał oryginalny prompt — tylko że w tym przypadku działał on poprawnie.

Zamierzony wzorzec (`app/` routing → `components/` → `hooks/` → `lib/` czyste funkcje → `context/` stan globalny) jest przestrzegany konsekwentnie w całym repo, łącznie z nowym kodem dodanym po poprzednim audycie.

---

## 2. Architektura i struktura kodu

Podział na warstwy pozostaje spójny. Nie znaleziono nowych cykli zależności ani god-file'ów poza tym, co już opisano (`editor-app.tsx`, patrz niżej). Jedno realne znalezisko dotyczące duplikacji, którego **nie ma** w `TODO.md` — poprzedni audyt go nie złapał:

```
[PRIORYTET: Średni] Zduplikowana logika weryfikacji ciasteczka SSO między wariantem stronowym a API
Lokalizacja: lib/sso.ts:38-148 (parseSsoCookie vs parseSsoCookieApi)
Opis: Funkcje parseSsoCookie (używana przez verifySso, dla stron) i parseSsoCookieApi (używana przez verifySsoApi, dla /api) implementują dokładnie ten sam ciąg kroków — odczyt ciasteczka, split po "|", walidacja liczby części, walidacja wygaśnięcia, odczyt SSO_SALT, weryfikacja HMAC — w ~70 niemal identycznych liniach, różniących się wyłącznie kształtem odpowiedzi błędu (redirect 302 do WordPress vs JSON 401/500). To dokładnie ten rodzaj duplikacji, o który pyta punkt 2 promptu audytowego ("duplikaty logiki, które powinny być wspólną funkcją") — nie został złapany w poprzednim audycie, prawdopodobnie dlatego, że powstał w tym samym commicie (891a96e), który naprawiał krytyczną lukę bezpieczeństwa, więc uwaga audytora skupiła się na samym fixie, nie na jego wewnętrznej strukturze. Ryzyko: dwie kopie logiki weryfikacji podpisu HMAC oznaczają dwa miejsca do zsynchronizowania przy każdej przyszłej zmianie formatu ciasteczka — rozjazd między nimi byłby błędem bezpieczeństwa, nie tylko stylu.
Rekomendacja: Wydzielić wspólną funkcję np. parseSsoCookieCore(request) -> {username, expires} | {reason: "missing"|"malformed"|"expired"|"invalid_signature"|"no_secret"}, a parseSsoCookie/parseSsoCookieApi zredukować do cienkiej warstwy mapującej reason na odpowiedni NextResponse (redirect vs JSON). Istniejące testy w tests/sso.test.ts i tests/api-routes.test.ts już pokrywają oba warianty zachowania, więc refaktor ma dobrą siatkę bezpieczeństwa.
Szacowany nakład: S
```

```
[PRIORYTET: Niski] editor-app.tsx jako orkiestrator kilku niezależnych przepływów — nadal otwarte, lekko urosło
Lokalizacja: components/editor/editor-app.tsx (572 linii, 5 useEffect)
Opis: Zgodnie z poprzednim audytem — plik łączy inicjalizację lokalnej sesji, ładowanie pliku współdzielonego, auto-load z Vimeo (teraz też z nowym parametrem vimeo_id_url) i guard przed zamknięciem karty. Od poprzedniego audytu plik urósł z 558 do 572 linii (dodanie obsługi vimeo_id_url) — kierunek zmian idzie w stronę większej złożoności w jednym pliku, nie mniejszej, mimo że problem był już zidentyfikowany.
Rekomendacja: Bez zmian względem poprzedniej rekomendacji — wydzielić każdy useEffect do własnego hooka w hooks/, konsekwentnie z resztą projektu. Warto to zrobić zanim dojdzie kolejny przepływ inicjalizacyjny.
Szacowany nakład: S
```

Poza tym: brak nowych `fooV2`/`foo_old`, brak nowych cykli zależności, brak nowych plików >500 linii poza `editor-app.tsx` (już znanym).

---

## 3. Ślady wielokrotnych poprawek ("łatania")

Zero `TODO/FIXME/HACK/XXX` w kodzie źródłowym (sprawdzone ponownie na aktualnym HEAD) — bez zmian względem poprzedniego audytu, projekt pozostaje w tym zakresie wyjątkowo czysty. Jeden nowy, wart odnotowania ślad wynikający z samej naprawy krytycznej luki:

```
[PRIORYTET: Wysoki] Ochrona SSO dla /api opiera się na pamięci developera, nie na wymuszeniu strukturalnym
Lokalizacja: proxy.ts:29-30 (matcher nadal wyklucza /api), app/api/*/route.ts (każdy woła verifySsoApi ręcznie)
Opis: Fix krytycznej luki (matcher middleware pomijał całe /api) polegał na dodaniu ręcznego wywołania verifySsoApi(request) jako pierwszej linii w każdym z 3 obecnych route handlerów — nie na mechanizmie, który wymusiłby to dla KAŻDEGO przyszłego route handlera w app/api/. Nic w architekturze (brak wspólnego wrappera typu withAuth(handler), brak reguły ESLint, brak testu weryfikującego "każdy plik w app/api/ importuje verifySsoApi") nie zapobiegnie dokładnie tej samej klasie błędu, jeśli ktoś doda 4. endpoint i zapomni o tej jednej linii — a `proxy.ts` go i tak przepuści bez ostrzeżenia, bo matcher nadal jawnie wyklucza /api. To nie jest cofnięcie fixa (obecne 3 route'y są poprawnie chronione, potwierdzone testami), tylko brak "guardraila" na przyszłość dla dokładnie tej samej krytycznej luki, którą właśnie naprawiono. Dodatkowo AGENTS.md:267 zawiera zdanie "Any other path is automatically public", które — w kontekście przyszłego route'u API dodanego bez wiedzy o tym wymogu — może być czytane myląco (jest prawdziwe dla stron, nie jest bezpieczne jako założenie dla nowych endpointów API bez jawnego dodania verifySsoApi).
Rekomendacja: (1) Wydzielić cienki wrapper, np. withApiAuth(handler: (req, ctx: {username}) => Promise<NextResponse>) w lib/sso.ts, który każdy nowy route handler musi jawnie użyć jako eksport GET/POST — trudniej "zapomnieć", bo brak wrappera oznacza brak exportu funkcji obsługującej żądanie. (2) Dodać test-strażnik (np. prosty skrypt/test iterujący po plikach w app/api/**/route.ts i sprawdzający, że każdy importuje verifySsoApi lub nowy wrapper) — to złapie regresję w CI, a nie dopiero w audycie. (3) Doprecyzować zdanie w AGENTS.md:267, żeby jawnie ostrzegało: nowe route'y API muszą same wywołać ochronę, middleware im w tym nie pomoże.
Szacowany nakład: M
```

---

## 4. Jakość kodu i utrzymywalność

Bez zmian względem poprzedniego audytu w pozytywnej ocenie: ESLint (`eslint-config-next/core-web-vitals`, `--max-warnings=0`) wyłącznie do jakości, Biome wyłącznie do formatowania, TypeScript strict. Potwierdzone bezpośrednio: `npm run lint` przechodzi z zerem ostrzeżeń na aktualnym HEAD. Walidacja w API route'ach nadal oparta o regexy ad-hoc (nie Zod/Joi) — akceptowalne przy 3 endpointach, ale patrz uwaga w sekcji 5 o spójności tej walidacji między dwoma bardzo podobnymi route'ami.

```
[PRIORYTET: Niski] Drobna niespójność implementacyjna między dwoma niemal identycznymi route'ami plikowymi
Lokalizacja: app/api/load-captions/route.ts:30-36 vs app/api/load-shared/route.ts:24-36
Opis: Oba route'y robią to samo (walidacja regexem nazwy pliku, path.resolve, sprawdzenie startsWith), ale load-captions dodaje bezpiecznik safeDirPrefix (baseDir z wymuszonym trailing slashem przed startsWith), a load-shared sprawdza filePath.startsWith(baseDir) bez tego zabezpieczenia. W obecnym stanie nie jest to wykorzystywalne (nazwa pliku jest już zwalidowana wcześniejszym regexem i nie może zawierać ".."), więc to nie jest realna luka — ale to dokładnie ten typ mikro-rozjazdu między dwoma kopiami bardzo podobnej logiki, który z czasem bywa źródłem prawdziwych bugów, gdy ktoś zmieni regex w jednym miejscu i zapomni o drugim.
Rekomendacja: Wydzielić wspólną funkcję pomocniczą resolveSafePath(baseDir, fileName, pattern) w lib/ i użyć jej w obu route'ach, żeby zabezpieczenie przed path traversal żyło w jednym miejscu, nie w dwóch prawie identycznych kopiach.
Szacowany nakład: S
```

`any` pozostaje skoncentrowane w `lib/audio-peaks.ts` (granica integracji z `mp4box.js`, biblioteką bez typów) — bez zmian od poprzedniego audytu, wciąż otwarte, wciąż niskiego priorytetu.

---

## 5. Bezpieczeństwo

Najważniejsza sekcja tej aktualizacji. Obie krytyczne luki z poprzedniego audytu (obejście SSO dla `/api`, DOM XSS) są **potwierdzone jako naprawione** — patrz weryfikacja na początku raportu. `npm audit` na aktualnym `package-lock.json`: **0 podatności** w zależnościach i dev-zależnościach.

```
[PRIORYTET: Średni] Brak nagłówków bezpieczeństwa (CSP i pokrewne) ustawianych po stronie aplikacji — nadal otwarte
Lokalizacja: next.config.ts (całość, brak sekcji headers()), public/_headers (tylko Cache-Control dla zasobów statycznych)
Opis: Bez zmian względem poprzedniego audytu — potwierdzone, że next.config.ts nadal nie definiuje headers(). Podnoszę priorytet z "Niski" na "Średni" względem poprzedniego audytu z jednego konkretnego powodu: projekt miał do niedawna udokumentowaną, potwierdzoną lukę DOM XSS (teraz naprawioną). CSP jest dokładnie tym mechanizmem obrony w głąb, który ograniczyłby skutki KOLEJNEJ, jeszcze nieodkrytej luki tego samego typu (np. gdyby ktoś w przyszłości dodał kolejne miejsce renderujące tekst napisów poza Reactem, tak jak zrobił to warstwa waveform). Fakt, że taka luka już raz wystąpiła w tym projekcie, jest argumentem za tym, żeby nie polegać wyłącznie na "znaleźć i naprawić każde miejsce z osobna".
Rekomendacja: Dodać podstawowy CSP i standardowe nagłówki (X-Content-Type-Options, Referrer-Policy, X-Frame-Options) w next.config.ts przez headers(), niezależnie od tego, co ewentualnie robi warstwa nginx/Cloudflare — nie polegać wyłącznie na infrastrukturze poza repo (patrz też punkt wyżej o tym, że nie da się jej zweryfikować z repo).
Szacowany nakład: S
```

Pozostałe pozytywy potwierdzone bezpośrednio: walidacja ścieżek plików (regex + blokada `..` + `path.resolve` + `startsWith`) skutecznie broni przed path traversal w obu route'ach plikowych; SSO oparte o HMAC-SHA256 z `crypto.subtle` jest implementowane poprawnie (stała sól z env, brak hardcoded sekretów w repo, brak plików `.env*` w repozytorium).

---

## 6. Zależności i środowisko

Bez zmian w ocenie pozytywnej: `.nvmrc` (24.18.0), `engines` (`>=24`), oba Dockerfile (`node:24-alpine`) i CI (`node-version-file: .nvmrc`) są ze sobą zgodne — zweryfikowane bezpośrednio, zero rozjazdu. `npm ci` przechodzi czysto (lockfile spójny z `package.json`). `npm audit` — 0 podatności.

`npm outdated` (uruchomione bezpośrednio) pokazuje wyłącznie drobne aktualizacje w zakresie już zadeklarowanych range'ów (`@tabler/icons-react`, `postcss`, `wavesurfer.js`, `eslint` patch) — dependabot je złapie automatycznie przy najbliższym przebiegu (grupy `patch`/`minor` w `.github/dependabot.yml`). Trzy pakiety mają dostępne major upgrade'y spoza obecnego range'u: `@types/node` (24→26), `eslint` (9→10), `typescript` (6→7) — nieoznaczone przez dependabot (grupy w `dependabot.yml` obejmują tylko patch/minor, nie major), co jest normalną, świadomą praktyką dla majorów wymagających ręcznej weryfikacji breaking changes, nie zaniedbaniem.

```
[PRIORYTET: Średni] Konfiguracja produkcyjna Dockera i nginx żyje całkowicie poza repozytorium — nadal otwarte
Lokalizacja: AGENTS.md ("Production compose file is at ~/containers/compose.yml (NOT in this repo)", "Nginx Configuration: ~/containers/nginx/...")
Opis: Bez zmian względem poprzedniego audytu. Realny koszt tego stanu wzrósł od poprzedniego audytu o jeden konkretny fakt: dwie kontrolki bezpieczeństwa (rate limiting na /api/vimeo/download, ewentualne nagłówki CSP na warstwie nginx) są teraz explicite deklarowane jako istniejące "tam", ale niemożliwe do potwierdzenia stąd (patrz sekcja 5). Utrzymywanie tego przez jedną osobę na jednej maszynie oznacza zarówno ryzyko utraty configu, jak i brak możliwości code review dla zmian bezpieczeństwa, które tam zachodzą.
Rekomendacja: Bez zmian względem poprzedniej rekomendacji — zwersjonować docker-compose.prod.yml i konfigurację nginx (choćby w osobnym repo infra), z wartościami specyficznymi dla maszyny wyciągniętymi do zmiennych.
Szacowany nakład: M
```

---

## 7. Testy

Zdecydowanie mocna strona projektu, i to coraz mocniejsza. Uruchomiłem cały zestaw bezpośrednio: **191/191 testów przechodzi** (`npm run test`, Node test runner przez `tsx`). Pokrycie logiki czystej w `lib/` pozostaje solidne (parsowanie SRT/VTT, operacje na wielu ścieżkach czasowych, undo/redo). Nowość od poprzedniego audytu: `tests/api-routes.test.ts` i `tests/proxy-middleware.test.ts` testują realny HMAC (poprawny podpis, zły podpis, brak ciasteczka, wygasła sesja) wywołując bezpośrednio wyeksportowane funkcje `GET` z prawdziwych plików route — to nie są testy "na pokaz", faktycznie łapałyby regresję krytycznej luki, gdyby ktoś ją przypadkiem przywrócił.

Jedyna luka warta odnotowania: brak testu, który złapałby scenariusz opisany w sekcji 3 (nowy route API dodany bez `verifySsoApi`) — ale to naturalna konsekwencja tego, że taki test musiałby sprawdzać strukturę repo, nie zachowanie istniejącego kodu (patrz rekomendacja w sekcji 3, punkt 2).

---

## 8. Wydajność

Bez zmian względem poprzedniego audytu — analiza statyczna bez profilowania runtime ma tu ograniczoną moc dowodową. Warstwa streamingu dużych plików (`lib/audio-peaks.ts`, mp4box + Web `AudioDecoder`, chunki 5MB) pozostaje zaprojektowana świadomie pod kątem unikania ładowania całych plików wideo do pamięci. Debounce 750ms na autosave lokalnej sesji (`lib/local-session.ts`) bez zmian. Nie znaleziono nowych operacji synchronicznych blokujących event loop ani niezamkniętych listenerów/timerów w kodzie dodanym od poprzedniego audytu.

```
[PRIORYTET: Niski] Ocena wydajności wymaga profilowania runtime — bez zmian, statyczny audyt tego nie zastąpi
Lokalizacja: całościowo
Opis: Jak w poprzednim audycie — realne wąskie gardła (przebudowa regionów waveformu przy edycji, koszt re-renderu przy dużej liczbie napisów) wymagają React DevTools Profiler / Performance tab na realnym pliku rzędu setek napisów i wideo 1GB+.
Rekomendacja: Jeśli wydajność przy dużych plikach jest priorytetem (README to sugeruje), przeprowadzić osobną sesję profilowania zamiast wnioskować z kodu.
Szacowany nakład: M
```

---

## 9. Logowanie i observability

Aplikacja pozostaje front-end-first z trzema wąskimi route'ami API, więc klasyczne metryki/health-checki backendowe mają tu z natury mniejsze zastosowanie niż w typowym serwisie. Logowanie klienckie (`lib/log.ts`) jest teraz stosowane konsekwentnie (potwierdzone — zero "dzikich" `console.*` w komponentach klienckich poza świadomie pozostawionymi w route'ach API po stronie serwera, co jest poprawne).

```
[PRIORYTET: Niski] Brak endpointu health-check mimo wdrożenia w Dockerze za nginx — nadal otwarte
Lokalizacja: app/api/ (brak /api/health), Dockerfile.prod, docker-compose-dev.yml (brak HEALTHCHECK)
Opis: Bez zmian względem poprzedniego audytu — zweryfikowałem bezpośrednio, HEALTHCHECK nadal nieobecny w obu Dockerfile i docker-compose.
Rekomendacja: Dodać app/api/health/route.ts zwracający 200 i podłączyć jako HEALTHCHECK w Dockerfile.prod.
Szacowany nakład: S
```

---

## 10. Dokumentacja i DX

Nadal mocna strona projektu, i to zweryfikowana w praktyce, nie tylko deklaratywnie: sprawdziłem, że aktualizacje `AGENTS.md` po poprzednim audycie faktycznie zgadzają się z kodem (11 plików z wyłączoną regułą ESLint — potwierdzone; 13 locale — potwierdzone). To dobry sygnał, że dokument jest realnie utrzymywany, nie tylko raz napisany.

```
[PRIORYTET: Niski] AGENTS.md zawiera zdanie, które może wprowadzać w błąd w kontekście przyszłych route'ów API
Lokalizacja: AGENTS.md:267 ("No need to update proxy.ts — SSO only applies to locale routes... Any other path is automatically public.")
Opis: To zdanie jest prawdziwe dla stron (np. /best-practices, /offline), ale w obecnym kontekście repo — gdzie /api/* JEST chronione, tylko nie przez proxy.ts, tylko przez ręczne wywołanie w każdym route handlerze — sformułowanie "automatically public" jest niebezpiecznie niedopowiedziane dla kogoś, kto czyta tylko ten fragment i dodaje nowy route w app/api/, zakładając (błędnie), że skoro middleware "automatycznie" nie chroni tej ścieżki, to i tak nie musi robić nic dodatkowego. Powiązane z znaleziskiem w sekcji 3.
Rekomendacja: Doprecyzować zdanie, np.: "SSO only applies via proxy.ts to locale routes and root. Static pages under app/ are intentionally public. API routes under app/api/ are NOT covered by proxy.ts at all — each route handler MUST call verifySsoApi() explicitly as its first line."
Szacowany nakład: S
```

`components.json` → `tailwind.config.ts` pozostaje świadomie udokumentowanym, zaakceptowanym stanem — bez nowej rekomendacji, zgodnie z decyzją zespołu odnotowaną w `AGENTS.md`.

---

## Top 10 najpilniejszych działań

Posortowane: priorytet, a przy równym priorytecie — mniejszy nakład wyżej. Celowo pomijam pozycje już potwierdzone jako `WDROZONE` w tabeli na początku raportu.

| # | Działanie | Priorytet | Nakład |
|---|---|---|---|
| 2 | Dodać strukturalny guardrail (wrapper `withApiAuth` + test-strażnik w CI) tak, by nowy route w `app/api/` fizycznie nie mógł zostać dodany bez ochrony SSO | Wysoki | M | - DONE
| 3 | Doprecyzować mylące zdanie w `AGENTS.md:267` o zakresie ochrony SSO dla `/api` | Wysoki (tania poprawka do #2) | S |
| 4 | Dodać podstawowy CSP i nagłówki bezpieczeństwa w `next.config.ts` (`headers()`) | Średni | S | - DONE
| 5 | Wydzielić wspólną logikę `parseSsoCookie`/`parseSsoCookieApi` w `lib/sso.ts` do jednej funkcji bazowej | Średni | S | - DONE
| 6 | Ujednolicić walidację ścieżek w `load-captions`/`load-shared` do jednej wspólnej funkcji (`resolveSafePath`) | Niski | S | - DONE
| 7 | Zwersjonować `docker-compose.prod.yml` i konfigurację nginx (choćby w osobnym repo infra) | Średni | M |
| 8 | Dodać `app/api/health/route.ts` + `HEALTHCHECK` w `Dockerfile.prod` | Niski | S |
| 9 | Wydzielić 4 `useEffect` z `editor-app.tsx` do osobnych hooków w `hooks/` | Niski | S | - DONE
| 10 | Dodać `types/mp4box.d.ts` pokrywający używane API zamiast `any` w `lib/audio-peaks.ts` | Niski | S | - DONE

---

## Ogólna ocena stanu projektu: 8/10 (poprzednio: 7/10)

**Uzasadnienie.** Podnoszę ocenę o punkt względem poprzedniego audytu z konkretnego, zweryfikowanego powodu: zespół nie tylko przyjął rekomendacje, ale wdrożył je merytorycznie poprawnie i udowodnił to testami — sprawdziłem to bezpośrednio w kodzie, nie na podstawie adnotacji `WDROZONE`. Obie krytyczne luki (obejście SSO, DOM XSS) są naprawione solidnie, `npm audit` zwraca zero podatności, 191 testów przechodzi, lint jest czysty. To rzadki, dobry wzorzec: audyt → fix → dowód fixa w testach, w ciągu jednego dnia roboczego.

To, co trzyma ocenę poniżej 9-10, to nie nowy dług, tylko dwa rodzaje ryzyka ujawnione właśnie *przez* sposób, w jaki naprawiono poprzednie luki: (1) dwie kontrolki bezpieczeństwa (rate limiting, docelowo CSP) istnieją wyłącznie jako deklaracje poza repozytorium, bez możliwości weryfikacji stąd; (2) fix krytycznej luki SSO dla `/api` polega na pamięci developera przy każdym kolejnym route handlerze, bez strukturalnego wymuszenia — czyli ta sama klasa błędu, która była krytyczna tydzień temu, nie ma dziś nic, co by ją systemowo uniemożliwiło w przyszłości, poza dyscypliną. Żadne z tych dwóch ryzyk nie jest dziś aktywną luką — oba są o tym, jak łatwo byłoby ją przypadkiem przywrócić.

---

## Sugerowana kolejność refaktoryzacji

1. **Najpierw doprecyzować dokumentację i dodać guardrail dla `/api` (#2, #3)** — tanie (S/M), zero ryzyka regresji funkcjonalnej, a bezpośrednio adresuje jedyne ryzyko tej klasy, która była już raz krytyczna w tym projekcie.
2. **Zweryfikować rate limiting w nginx (#1) równolegle** — to weryfikacja stanu faktycznego, nie zmiana kodu, więc można robić niezależnie od reszty.
3. **Dodać CSP (#4)** — niskie ryzyko regresji (nagłówki addytywne), dobra kolejność zaraz po #2/#3, bo to ta sama rodzina "obrona w głąb dla bezpieczeństwa".
4. **Refaktory czysto mechaniczne bez zmiany zachowania (#5, #6, #10)** — mają już siatkę testów, dobre jako "filler" commity między większymi zmianami, podobnie jak zalecił to poprzedni audyt dla analogicznych pozycji.
5. **Na końcu #7, #8, #9** — porządkowe/organizacyjne, zero pilności biznesowej, najlepiej zrobić po ustabilizowaniu powyższych, żeby nie mieszać kategorii zmian w jednym PR.
