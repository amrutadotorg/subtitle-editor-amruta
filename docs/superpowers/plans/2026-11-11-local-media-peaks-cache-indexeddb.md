# Plan: Cachowanie pików audio (peaks) plików lokalnych w IndexedDB

> **Dla agentów:** plan wykonawczy krok-po-kroku. Każde zadanie kończy się zielonym `npm run test`.
> Po całości obowiązuje pełny [Verification Workflow](../../../AGENTS.md#verification-workflow).

**Data utworzenia:** 2026-11-11
**Wersja:** 2 (poprawiona po audycie)
**Status:** Zrealizowany (2026-11-11); weryfikacja manualna w przeglądarce wykonana dla pkt 1–5 (patrz §7)

---

## 1. Kontekst i problem

### 1.1. Co faktycznie działa dziś

Generowanie pików dla plików lokalnych **nie zostało usunięte** — usunięte zostało wyłącznie
_cachowanie_. W `components/waveform-visualizer/use-waveform-peaks.ts`:

```ts
47:  const large = mediaFile.size > 100 * 1024 * 1024;
50:  const isMp4 = mediaFile.name.toLowerCase().match(/\.(mp4|m4a|mov)$/);
52:  if (large && isMp4) {
54:    if (!skipCache && peaksCacheKey) { /* ← zawsze pomijane: key = undefined */ }
72:    extractPeaks(mediaFile, (percent) => setExtractionProgress(percent)); // ← działa
79:    if (peaksCacheKey) { setCachedPeaks(...); }  // ← zawsze pomijane
```

Trzy realne ścieżki (plan pracuje wyłącznie na drugiej):

| Warunek pliku                    | Zachowanie dziś                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **< 100 MB**                     | brak `extractPeaks`; WaveSurfer dekoduje Web Audio w locie                                                             |
| **> 100 MB `.mp4/.m4a/.mov`**    | `extractPeaks` (mp4box + `AudioDecoder`) **działa**, pokazuje „Generating waveform: N%”, ale wynik nie jest zapisywany |
| **> 100 MB inne (`.mkv/.webm`)** | cichy dummy peaks `[0]`; użytkownik widzi sam spinner bez progresu (`use-waveform-peaks.ts:96-100`)                    |

Po usunięciu Vimeo (`e111aa7`) prop `peaksCacheKey` nie jest przekazywany z `editor-app.tsx`,
więc `lib/waveform-peaks-cache.ts` jest martwy, a każdy duży MP4 jest dekodowany od zera.

### 1.2. Problemy przy przełączaniu wideo

1. **Brak natychmiastowego resetu:** przy zmianie `mediaFile` stany `extractedPeaks`,
   `extractedDuration` nie są czyszczone — do czasu zakończenia nowej ekstrakcji na ekranie
   wiszą piki poprzedniego pliku (reset istnieje tylko dla `mediaFile === null`, linie 40–45).
2. **Brak anulowania:** nie ma flagi `cancelled` ani `AbortSignal` — `then()` z poprzedniego
   pliku może nadpisać stan nowego, a stara ekstrakcja działa dalej (dwa `AudioDecoder`-y
   równolegle przy szybkim przełączaniu).
3. **Niespójne ładowanie pliku:** `<input type="file">` w `components/video-player.tsx:288-293`
   woła surowe `setMediaFile(file)` i pomija `loadMediaFile` z `hooks/use-media-file.ts`
   (które robi `setMediaFile(null)` + `setTimeout` = wymuszony remount i reset object URL).
4. **Dummy peaks > 100 MB dla nie-MP4** — brak progresu, wrażenie zawieszenia.

---

## 2. Decyzje projektowe (rozstrzygnięte w tej wersji planu)

| #   | Decyzja                                                                                                    | Uzasadnienie / odrzucona alternatywa                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Klucz `local:v1:<encodeURIComponent(name)>:<size>:<lastModified>`                                          | `name` może zawierać `:` → bez escapowania format jest niejednoznaczny. `v1` to **wersja algorytmu pików** (`POINTS_PER_SECOND` w `lib/audio-peaks.ts`), nie wersja schematu — musi być podbita przy zmianie parametrów dekodowania.        |
| D2  | `peaks` zapisywane jako `Float32Array`, `DB_VERSION` 1 → 2, store czyszczony przy upgrade z v1             | `Array.from()` daje `number[]` (~8 B/element, do 2× więcej niż `Float32Array`). Cache jest dziś praktycznie pusty (martwa ścieżka), więc to ostatni dzwonek na zmianę formatu bez migracji.                                                 |
| D3  | Ewiction: LRU po `updatedAt`, limit **20 wpisów**, prune po zapisie                                        | Bez tego każda zmiana nazwy pliku zostawia wieczny wpis. 20 × ~150 kB (1 h materiału przy 10 pkt/s) ≈ kilka MB — bezpiecznie dla quota. Odrzucone: brak ewiction + wpis w „znanych problemach” (rosłoby bez końca).                         |
| D4  | `setCachedPeaks` **nigdy nie odrzuca** Promise (błędy połykane)                                            | Dziś wołane bez `.catch()` (`use-waveform-peaks.ts:80`) → przy `QuotaExceededError` mielibyśmy unhandled rejection w konsoli. Cache jest best-effort z definicji.                                                                           |
| D5  | `openDB()` dostaje `request.onblocked` → reject, oraz `db.onversionchange` → `db.close()`                  | Bez tego zakolejkowane `deleteDatabase` z innej karty (patrz plan `2026-11-11-clear-autosave-indexeddb-cache.md`) potrafi **zawiesić `open()` na zawsze** → `getCachedPeaks()` nigdy nie rozwiązuje Promise → wieczny spinner zamiast fali. |
| D6  | Piki lokalne **nie są** czyszczone przez „Clear autosave” / „Discard”                                      | Kasowanie cache'u audio pod przyciskiem opisującym autozapis sesji to minuty przeliczeń bez powodu. Tym przyciskiem usuwana jest tylko osierocona baza `subtitle-editor-vimeo-cache` (patrz §6).                                            |
| D7  | Anulowanie realizowane przez `AbortSignal` przekazany do `extractPeaks` **oraz** flagę `cancelled` w hooku | Sama flaga `cancelled` chroni stan, ale nie zatrzymuje dekodowania > 100 MB. Wymaga rozszerzenia `lib/audio-peaks.ts` (nowy plik w zakresie).                                                                                               |
| D8  | Testy IndexedDB na `fake-indexeddb` (devDependency, import `fake-indexeddb/auto`)                          | jsdom nie implementuje IndexedDB. Ręczny stub `IDBFactory` nie obsłuży `onsuccess`/`oncomplete`/`onerror`/`onblocked` w sposób wiarygodny. `fake-indexeddb` obsłuży też plan czyszczenia cache.                                             |

---

## 3. Zadania krok po kroku

### Zadanie 0: Infrastruktura testowa

**Pliki:**

- Modyfikacja: `package.json` (+ `package-lock.json`)

Kroki:

- [x] **Step 1:** `npm i -D fake-indexeddb` (tylko devDependency; nie trafia do bundla).
- [x] **Step 2:** Uruchom `npm run knip` — nowa zależność używana w `tests/` nie może zostać zgłoszona jako nieużywana. Jeśli zostanie, dopisz ją w `knip.json` → `ignoreDependencies`.

---

### Zadanie 1: `lib/waveform-peaks-cache.ts` — klucz, format, hardening

**Pliki:**

- Modyfikacja: `lib/waveform-peaks-cache.ts`
- Utworzenie: `tests/waveform-peaks-cache.test.ts`

Kroki:

- [x] **Step 1:** Podbij `DB_VERSION` do `2` i zmień `PeaksCacheEntry`:

  ```ts
  interface PeaksCacheEntry {
    peaks: Float32Array; // structured clone wspiera Float32Array
    duration: number;
    updatedAt: number;
  }
  ```

- [x] **Step 2:** W `openDB()`:
  - owiń samo `indexedDB.open()` w `try/catch` (sam **odczyt** właściwości `indexedDB` potrafi rzucić `SecurityError`),
  - w `onupgradeneeded`: utwórz store, jeśli brak; jeśli `event.oldVersion === 1` → `request.transaction.objectStore(STORE_NAME).clear()` (stare `number[]` nie są kompatybilne),
  - dodaj `request.onblocked = () => reject(new Error("IndexedDB open blocked"))`,
  - w `onsuccess`: `db.onversionchange = () => db.close()` przed `resolve(db)`.

- [x] **Step 3:** Wyeksportuj `computeLocalMediaPeaksKey(file: File): string` zgodnie z D1 (z `encodeURIComponent(file.name)`).

- [x] **Step 4:** `setCachedPeaks`: zapisuj `Float32Array` (bez `Array.from`), ustaw `updatedAt: Date.now()`, spełnij D4 (nigdy nie odrzucaj — błędy transakcji połykaj, zawsze `db.close()`).

- [x] **Step 5:** Dodaj wewnętrzną funkcję `pruneCachedPeaks(db, maxEntries = 20)`: odczytaj wszystkie klucze i `updatedAt`, usuń najstarsze ponad limit. Wywołaj po udanym `put` (best-effort, błędy połykane).

- [x] **Step 6:** `getCachedPeaks`: zachowaj obecny kształt zwracany (`{ peaks: Float32Array[]; duration }`) — jeden kanał w tablicy. Dla wpisów legacy (`Array.isArray(entry.peaks)`) zrób `new Float32Array(entry.peaks)` zamiast wywalać się.

- [x] **Step 7:** Testy w `tests/waveform-peaks-cache.test.ts` (`import "fake-indexeddb/auto"` na górze, styl jak `tests/last-position.test.ts`):
  - `computeLocalMediaPeaksKey` — format, escapowanie nazwy z `:`, unikalność przy różnym `size`/`lastModified`/`name` (`new File([bytes], "a.mp4", { lastModified: 1 })` działa w Node 26),
  - `setCachedPeaks` → `getCachedPeaks` round-trip (zwraca `Float32Array` o tej samej długości i wartościach, `duration` zachowany),
  - `getCachedPeaks` dla nieistniejącego klucza → `null`,
  - `setCachedPeaks` nie odrzuca przy błędzie (np. `indexedDB.deleteDatabase` w trakcie / zamknięty store) — `assert.doesNotReject`,
  - prune: zapis 22 wpisów → w store zostaje 20 najnowszych,
  - brak `indexedDB` w `globalThis` → `getCachedPeaks` = `null`, `setCachedPeaks` cicho kończy.

  > `fake-indexeddb/auto` rejestruje global na poziomie modułu, więc test „brak IDB” musi w `try/finally` zrobić `delete (globalThis as { indexedDB?: unknown }).indexedDB` i przywrócić go po sobie. Testy w jednym pliku współdzielą proces — nie zostawiaj globala usuniętego.

- [x] **Step 8:** `npm run test`.

---

### Zadanie 2: `lib/audio-peaks.ts` — anulowalna ekstrakcja

**Pliki:**

- Modyfikacja: `lib/audio-peaks.ts`

Kroki:

- [x] **Step 1:** Zmień sygnaturę na `extractPeaks(file: File, onProgress?: (percent: number) => void, signal?: AbortSignal)`.
- [x] **Step 2:** Sprawdzaj `signal?.aborted` na początku `readNextMdatChunk()` oraz w `mp4box.onSamples` — przy anulowaniu: `decoder?.close()` w `try/catch`, następnie `reject(new DOMException("Aborted", "AbortError"))` i `return` (bez `resolve`, bez `onProgress(100)`).
- [x] **Step 3:** Nie zmieniaj zachowania dla wywołań bez `signal` (wsteczna kompatybilność) — istniejący test/ścieżka muszą działać bez modyfikacji.
- [x] **Step 4:** `npm run test`.

> Uwaga: `lib/audio-peaks.ts` korzysta z `mp4box` i WebCodecs — w jsdom nie da się przetestować pełnej ścieżki. Wystarczy test typu: `extractPeaks(file, undefined, alreadyAbortedSignal)` odrzuca z `AbortError` (jeśli da się go uruchomić bez WebCodecs; w przeciwnym razie udokumentuj brak testu w komentarzu i pokryj logikę w Zadaniu 3).

---

### Zadanie 3: `useWaveformPeaks` — reset, anulowanie, brak wycieku URL

**Pliki:**

- Modyfikacja: `components/waveform-visualizer/use-waveform-peaks.ts`

Kroki:

- [x] **Step 1:** Na początku `useEffect` (po gałęzi `!mediaFile`): `let cancelled = false;`, `const controller = new AbortController();` oraz natychmiastowy reset: `setExtractedPeaks(undefined)`, `setExtractedDuration(undefined)`, `setExtractionProgress(0)`, `setIsExtracting(false)`.

- [x] **Step 2:** W cleanupie: `cancelled = true; controller.abort();` — oprócz obecnego zwalniania `mediaUrl`.

- [x] **Step 3:** We wszystkich `then`/`catch` sprawdzaj `if (cancelled) return;` **przed** każdym `setState`. Przy `cancelled` **natychmiast** `URL.revokeObjectURL(objectUrl)` dla URL utworzonego w tym wywołaniu (inaczej blob wycieka — URL nigdy nie trafia do stanu, więc kolejny cleanup go nie zwolni).

- [x] **Step 4:** W `catch` ignoruj `AbortError` (`(error as Error)?.name === "AbortError"` → `return`), nie ustawiaj dummy peaks.

- [x] **Step 5:** Przekaż `controller.signal` do `extractPeaks`, a `peaksCacheKey` do `getCachedPeaks`/`setCachedPeaks` (bez `.catch()` — D4 gwarantuje brak odrzucenia).

- [x] **Step 6:** W gałęzi `!mediaFile` dodaj brakujący `setIsLargeFile(false)`.

- [x] **Step 7:** `npm run test`.

> `react-hooks/set-state-in-effect` jest wyłączony dla tego pliku w `eslint.config.js` — reset w ciele efektu jest tu dozwolony i **nie** należy go przenosić do `useMemo`.

---

### Zadanie 4: Podłączenie klucza i ujednolicenie ładowania mediów

**Pliki:**

- Modyfikacja: `components/editor/editor-app.tsx`
- Modyfikacja: `components/video-player.tsx`
- Modyfikacja: `components/editor/editor-app.tsx` (miejsce wywołania `<VideoPlayer />`, dziś `setMediaFile={setMediaFile}`)
- Modyfikacja: `tests/video-player.test.ts` (**wymagane**, nie „jeśli dotyczy”: `setMediaFile` występuje w liniach 20 i 85)

Kroki:

- [x] **Step 1:** W `editor-app.tsx` policz klucz przez `useMemo` i przekaż go do fali:

  ```ts
  const peaksCacheKey = useMemo(
    () => (mediaFile ? computeLocalMediaPeaksKey(mediaFile) : null),
    [mediaFile],
  );
  // ...
  <WaveformVisualizer peaksCacheKey={peaksCacheKey} ... />
  ```

- [x] **Step 2:** W `VideoPlayerProps` zamień `setMediaFile: (file: File | null) => void` na `onLoadMediaFile: (file: File) => void`. W handlerze inputa (`video-player.tsx:288-293`) zostaw tylko `onLoadMediaFile(file)` — `loadMediaFile` z `hooks/use-media-file.ts` sam ustawia `mediaFile` i `mediaFileName`, więc usuń stąd `setMediaFileName(file.name)`.

- [x] **Step 3:** Usuń z `VideoPlayerProps` prop `setMediaFileName: (name: string) => void` (po zmianie z Step 2 jest nieużywany). Zaktualizuj wywołanie `<VideoPlayer />` w `editor-app.tsx:357-359` (dziś `mediaFile={mediaFile} setMediaFile={setMediaFile} setMediaFileName={setMediaFileName}`) oraz oba miejsca w `tests/video-player.test.ts` (linie 20 i 85).

- [x] **Step 4:** `npm run lint` + `npm run test` (zmiana propsów musi być spójna; `tsc` w `npm run build` to potwierdzi).

---

### Zadanie 5: Koordynacja z planem czyszczenia IndexedDB

**Pliki:**

- Odniesienie: `docs/superpowers/plans/2026-11-11-clear-autosave-indexeddb-cache.md`

Kroki:

- [x] **Step 1:** Ustal w planie czyszczenia (D6), że „Clear autosave” **nie** usuwa `subtitle-editor-waveform-cache`; jedynym celem jest osierocona `subtitle-editor-vimeo-cache`.
- [x] **Step 2:** Usuń z tamtego planu `clearWaveformPeaksCache()` (nieużywany eksport → `knip` failure) oraz czyszczenie IndexedDB z `discardLocalSession` (koszt: minuty ponownej ekstrakcji przy starcie aplikacji).
- [x] **Step 3:** Sprawdź, że `openDB()` z Zadania 1 (D5) jest odporne na zakolejkowane `deleteDatabase` z tamtego planu.

---

### Zadanie 6: Dokumentacja i weryfikacja końcowa

**Pliki:**

- Modyfikacja: `AGENTS.md`

Kroki:

- [x] **Step 1:** W sekcji **State Management** dopisz: piki dużych plików lokalnych (> 100 MB `.mp4/.m4a/.mov`) są cache'owane w IndexedDB (`subtitle-editor-waveform-cache`, store `peaks`) pod kluczem `local:v1:<name>:<size>:<lastModified>`; limit 20 wpisów LRU; cache jest best-effort i nie jest czyszczony przez „Clear autosave”.
- [x] **Step 2:** Pełny łańcuch:

  ```bash
  npm run lint
  npm run format
  npm run format:check
  npm run test
  npm run knip
  npm run build
  ```

- [x] **Step 3:** Weryfikacja manualna w przeglądarce (testy w jsdom tego nie pokryją):
  1. Otwórz plik `.mp4` > 100 MB → widoczny progres „Generating waveform: N%" → fala się rysuje.
  2. DevTools → Application → IndexedDB → `subtitle-editor-waveform-cache` → `peaks` → **1 wpis** z kluczem `local:v1:...`, `peaks` jako `Float32Array`.
  3. Odśwież stronę i wczytaj **ten sam** plik → fala pojawia się natychmiast, bez progresu.
  4. Wczytaj drugi duży `.mp4` → stara fala znika natychmiast (brak „wiszących” pików), progres startuje od 0%.
  5. Szybkie przełączenie A → B → A (w trakcie ekstrakcji) → brak błędów w konsoli, brak unhandled rejection, końcowa fala odpowiada A.
  6. Plik `.mkv` > 100 MB → spinner bez progresu (znane, poza zakresem) — brak regresji. _(nie testowano — brak pliku)_

> Weryfikacja 1–5 wykonana w headless Chromium (Playwright) na plikach 129 MB i 77 MB: progres 13→93%, wpis `local:v1:test120.mp4:134835632:…` z `Float32Array` (9140 próbek), reload = fala po ~1 s bez progresu (vs ~6 s przy ekstrakcji), przełączenie A→B→A bez błędów.

---

## 7. Uwagi po realizacji (2026-11-11)

1. **CSP blokował falę dla plików < 100 MB** — `connect-src 'self'` w `next.config.ts` blokowało
   `fetch(blob:…)` wykonywany przez WaveSurfer. Efekt: spinner, po 15 s watchdog, pusta fala —
   dokładnie objaw zgłoszony przy pliku 77 MB. Naprawione przez `connect-src 'self' blob:`.
2. **Spinner po trafieniu w cache** — `setIsLoading(true)` na ścieżce cache powodował, że nakładka
   (spinacz) zasłaniała gotową falę do 15 s (watchdog), bo `ready` z nowej instancji WaveSurfer
   potrafi odpalić się przed subskrypcją w `useWaveformRegions`. Overlay jest teraz ustawiany tylko
   tam, gdzie WaveSurfer sam dekoduje plik (małe pliki); duże pliki pokazują `isExtracting`
   z progresem, a po gotowej fali nie ma już żadnej nakładki.

---

## 4. Ryzyka i świadome decyzje

| Ryzyko / pytanie                                                            | Decyzja i mitygacja                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lastModified` nie jest stabilne (np. plik podmieniony)                     | Klucz się zmieni → nowy wpis, stary wyprany przez LRU (D3). Poprawność zachowana, cache tylko nie trafia.                                                                                                                                                                         |
| Dwa różne pliki o tej samej nazwie/rozmiarze/mtime                          | Kolizja praktycznie niemożliwa; skutek = błędna fala. Zaakceptowane (alternatywa: hashowanie zawartości = czytanie całego pliku > 100 MB, nieakceptowalne).                                                                                                                       |
| `Float32Array` w structured clone                                           | Wspierane we wszystkich przeglądarkach docelowych; wpisy legacy (`number[]`) czyszczone przy upgrade do v2 i dodatkowo tolerowane w `getCachedPeaks`.                                                                                                                             |
| `navigator.storage` eviction (Safari/ITP)                                   | Cache best-effort: brak wpisu = zwykła ekstrakcja. LRU ogranicza rozmiar do kilku MB.                                                                                                                                                                                             |
| Anulowanie nie zwalnia natychmiast pamięci `AudioDecoder`                   | `decoder.close()` w ścieżce abort + ignorowanie dalszych chunków; pełne „natychmiast” nie jest gwarantowane przez WebCodecs.                                                                                                                                                      |
| `<VideoPlayer>` nadal tworzy własny object URL (`video-player.tsx:172-179`) | Poza zakresem — plan ujednolica tylko _wybór pliku_, nie źródło URL dla elementu `<video>`.                                                                                                                                                                                       |
| Pliki > 100 MB inne niż mp4/m4a/mov (dummy peaks)                           | Świadomie poza zakresem — osobny temat (wymaga np. `decodeAudioData` dla webm/mkv).                                                                                                                                                                                               |
| Testy `onblocked`/`onversionchange`                                         | `fake-indexeddb` implementuje semantykę wersji i blokad — **zweryfikuj to w Zadaniu 1** (jeśli `onblocked` nie zadziała, pokryj ścieżkę stubem `IDBOpenDBRequest`). `onversionchange` pokryj testem otwierającym dwa połączenia i sprawdzającym, że stare `db` zostaje zamknięte. |

---

## 5. Kryteria akceptacji

- [x] Duży lokalny `.mp4/.m4a/.mov` (> 100 MB) zapisuje piki w `subtitle-editor-waveform-cache` i po reloadzie ładuje je z cache bez `extractPeaks`.
- [x] Klucz to `local:v1:<encoded-name>:<size>:<lastModified>`; `computeLocalMediaPeaksKey` jest pokryte testami.
- [x] Wpisy mają postać `{ peaks: Float32Array; duration: number; updatedAt: number }`, `DB_VERSION === 2`, store jest czyszczony przy upgrade z v1.
- [x] Store nigdy nie przekracza 20 wpisów (LRU po `updatedAt`).
- [x] `setCachedPeaks` nigdy nie odrzuca Promise; brak unhandled rejection przy `QuotaExceededError` / zamkniętym store.
- [x] `openDB()` odrzuca przy `onblocked` i zamyka połączenie na `onversionchange`.
- [x] Przy zmianie pliku stare piki są natychmiast czyszczone, a wyniki anulowanej ekstrakcji nie nadpisują stanu nowego pliku.
- [x] Anulowana ekstrakcja nie pozostawia osieroconego object URL.
- [x] `<input type="file">` w `VideoPlayer` używa `loadMediaFile`; `VideoPlayerProps` nie zawiera już `setMediaFile`; testy zaktualizowane.
- [x] `npm run lint`, `npm run format:check`, `npm run test`, `npm run knip`, `npm run build` — wszystkie z kodem 0.
- [x] Weryfikacja manualna z Zadania 6 przeszła (punkty 1–5; pkt 6 nie dotyczy — brak pliku `.mkv`).

---

## 6. Powiązania z innymi planami

- `docs/superpowers/plans/2026-11-11-clear-autosave-indexeddb-cache.md` — **realizować po tym planie** i w okrojonym zakresie: jednorazowe usunięcie osieroconej bazy `subtitle-editor-vimeo-cache`, bez czyszczenia cache'u pików (D6).
- `docs/superpowers/plans/2026-11-10-remove-vimeo-download.md` — ten plan częściowo odwraca jego decyzję „nie kodujemy migracji usuwającej bazę Vimeo” (dotyczy wyłącznie `subtitle-editor-vimeo-cache`, nie `waveform-cache`).
