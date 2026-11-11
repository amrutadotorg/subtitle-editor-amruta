# Plan: Czyszczenie pamięci podręcznej IndexedDB podczas „Clear autosave”

> **Dla agentów:** plan wykonawczy krok-po-kroku. Każde zadanie kończy się zielonym `npm run test`.
> Po całości obowiązuje pełny [Verification Workflow](../../../AGENTS.md#verification-workflow).

**Data utworzenia:** 2026-11-11  
**Status:** Gotowy do realizacji / Oczekuje na zatwierdzenie

---

## 1. Cel i motywacja

Funkcja „Clear” („Wyczyść”) w sekcji „Local autosave” w oknie ustawień edytora ([`settings-dialog.tsx`](file:///home/admin/containers/subtitle-editor/components/app-header/settings-dialog.tsx)) czyści obecnie:
1. Snapshot sesji w `localStorage` (`subtitle-editor:autosave:v1`),
2. Pozycję wznowienia pracy w `localStorage` (`subtitle-editor:position:v1`).

Jednocześnie aplikacja korzysta (lub korzystała) z baz danych **IndexedDB**:
- **Aktywna baza:** `subtitle-editor-waveform-cache` (object store: `peaks` w [`lib/waveform-peaks-cache.ts`](file:///home/admin/containers/subtitle-editor/lib/waveform-peaks-cache.ts)) — przechowuje obliczone piki audio dla załadowanych plików wideo/audio.
- **Baza archiwalna/osierocona:** `subtitle-editor-vimeo-cache` (object store: `files`) — baza po usuniętej integracji Vimeo, która u istniejących użytkowników może nadal zajmować setki megabajtów na dysku w przeglądarce.

**Cel wdrożenia:** Rozszerzenie akcji „Clear autosave” o jednorazowe usunięcie **osieroconej** bazy
`subtitle-editor-vimeo-cache` z IndexedDB. Cache pików (`subtitle-editor-waveform-cache`) **nie jest**
czyszczony — patrz decyzja D6 w planie
[`2026-11-11-local-media-peaks-cache-indexeddb.md`](./2026-11-11-local-media-peaks-cache-indexeddb.md).

---

## 2. Architektura i projekt techniczny

### 2.1. Warstwa bazy danych (`lib/indexed-db-cache.ts`)

Utworzymy dedykowany moduł pomocniczy do usuwania osieroconej bazy Vimeo:
- `deleteDatabaseSafely(dbName: string)` — usuwa wskazaną bazę, odpornie na `onblocked`/błędy,
- `clearLegacyVimeoCache()` — usuwa wyłącznie `subtitle-editor-vimeo-cache`.

**Świadomie NIE usuwamy** `subtitle-editor-waveform-cache`: to aktywny cache pików audio
(`lib/waveform-peaks-cache.ts`), a jego skasowanie pod przyciskiem opisującym autozapis sesji
oznaczałoby minuty ponownej ekstrakcji bez powodu (D6 w planie cache'u pików).

### 2.2. Obsługa środowisk i asynchroniczności

- **SSR / Node.js:** Funkcje czyszczenia muszą być w 100% bezpieczne w środowisku bez DOM (`typeof window === "undefined"` lub brak `window.indexedDB`).
- **Tryb prywatny / błędy uprawnień:** Każda operacja IndexedDB musi być objęta `try/catch` i bezpiecznie ignorować błędy uprawnień (np. `SecurityError` w niektórych konfiguracjach przeglądarek).
- **Zdarzenie `onblocked`:** Jeśli w innej karcie baza jest otwarta, żądanie `deleteDatabase` może emitować zdarzenie `blocked`. Mechanizm czyszczenia musi obsłużyć `onblocked` (np. natychmiastowym rozwiązaniem Promise lub krótkim timeoutem), aby nie blokować interfejsu użytkownika.
- **Stan w pamięci RAM:** Usunięcie IndexedDB czyści dane z dysku, ale nie psuje aktualnie wyrenderowanej fali dźwiękowej w WaveSurferze (która operuje na buforze w pamięci podręcznej komponentu).

### 2.3. Integracja z orkiestracją sesji (`hooks/use-local-session-orchestration.ts`)

- Metoda `clearLocalSession` w hooku orkiestracji staje się asynchroniczna (`async () => Promise<void>`).
- W [`context/subtitle/types.ts`](file:///home/admin/containers/subtitle-editor/context/subtitle/types.ts) sygnatura `clearLocalSession` zostaje zaktualizowana do:

  ```ts
  clearLocalSession: () => Promise<void> | void;
  ```
- Po wyczyszczeniu `localStorage` (`clearLocalSessionSnapshot` oraz `clearLastPosition`) hook wywołuje `clearLegacyVimeoCache()` (tylko osierocona baza Vimeo; cache pików zostaje).

### 2.4. Integracja z UI (`components/app-header/settings-dialog.tsx`)

- W [`settings-dialog.tsx`](file:///home/admin/containers/subtitle-editor/components/app-header/settings-dialog.tsx):
  - `handleClearLocalSession` staje się asynchroniczny (`async`),
  - Opcjonalny stan `isClearing` zapobiega wielokrotnemu kliknięciu podczas usuwania baz,
  - Toast informujący o wyczyszczeniu autozapisu wyświetla się po zakończeniu operacji.

---

## 3. Zakres zmian

### W zakresie:

1. Nowa funkcja / moduł usuwający osieroconą bazę `subtitle-editor-vimeo-cache` (bez ruszania `subtitle-editor-waveform-cache`).
2. Podpięcie czyszczenia pod `clearLocalSession()` w hooku `use-local-session-orchestration.ts`.
3. Obsługa asynchroniczności w `settings-dialog.tsx`.
4. **Brak** czyszczenia IndexedDB w `discardLocalSession()` — odrzucenie sesji nie ma kasować cache'u pików (D6).
5. Bezpieczeństwo SSR i obsługa trybu incognito / przeglądarek bez wsparcia IndexedDB.
6. Testy jednostkowe weryfikujące czyszczenie i odporność na brak IndexedDB / błędy.
7. Aktualizacja dokumentacji [`AGENTS.md`](file:///home/admin/containers/subtitle-editor/AGENTS.md).

### Poza zakresem:

- Zmiana struktury store'a `peaks` w `subtitle-editor-waveform-cache`.
- Wprowadzanie nowych kluczy do `localStorage`.
- Zmiana zachowania autosave w locie podczas edycji napisów.

---

## 4. Zadania krok po kroku

### Zadanie 1: Utworzenie mechanizmu czyszczenia IndexedDB

Cel: implementacja odpornego na błędy modułu czyszczącego bazy IndexedDB dla edytora napisów.

**Pliki:**
- Utworzenie: `lib/indexed-db-cache.ts`
- Utworzenie: `tests/indexed-db-cache.test.ts`

Kroki:
- [ ] **Step 1:** Zaimplementuj funkcję `deleteDatabaseSafely(dbName: string): Promise<boolean>` z obsługą `onsuccess`, `onerror`, `onblocked` oraz `try/catch`.
- [ ] **Step 2:** Zaimplementuj funkcję `clearLegacyVimeoCache(): Promise<void>`, która:
  - sprawdza dostępność `indexedDB` (`typeof indexedDB === "undefined"` → ciche zakończenie),
  - usuwa **wyłącznie** `subtitle-editor-vimeo-cache` przy użyciu `deleteDatabaseSafely`.
  - Nie dodawaj `clearWaveformPeaksCache()` ani odkrywania baz po prefiksie `subtitle-editor-` — cache pików musi przetrwać (D6).
- [ ] **Step 3:** Napisz testy jednostkowe w `tests/indexed-db-cache.test.ts` (`fake-indexeddb/auto`):
  - zachowanie w środowisku Node bez `indexedDB` (ciche zakończenie sukcesem),
  - usunięcie `subtitle-editor-vimeo-cache` bez ruszania `subtitle-editor-waveform-cache`,
  - obsługa błędu / zdarzenia `onblocked` bez zawieszania Promise.
- [ ] **Step 4:** Uruchom `npm run test` — wszystkie testy na zielono.

---

### Zadanie 2: Integracja z orkiestracją sesji i kontekstem

Cel: powiązanie operacji `clearLocalSession` z usunięciem osieroconej bazy Vimeo.

**Pliki:**
- Modyfikacja: `context/subtitle/types.ts`
- Modyfikacja: `context/subtitle/provider.tsx`
- Modyfikacja: `hooks/use-local-session-orchestration.ts`
- Modyfikacja: `tests/local-session.test.ts`

Kroki:
- [ ] **Step 1:** W `context/subtitle/types.ts` zaktualizuj typ `clearLocalSession` w interfejsie `LocalSessionValue` do `() => Promise<void> | void;`.
- [ ] **Step 2:** W `hooks/use-local-session-orchestration.ts`:
  - Zaimportuj `clearLegacyVimeoCache`.
  - W `clearLocalSession` dodaj wywołanie `await clearLegacyVimeoCache()`.
  - **Nie** dodawaj czyszczenia IndexedDB w `discardLocalSession` (D6 — odrzucenie sesji nie kasuje cache'u pików).
- [ ] **Step 3:** W `context/subtitle/provider.tsx` upewnij się, że memoizacja i przekazywanie `clearLocalSession` zachowują stabilną referencję.
- [ ] **Step 4:** Zaktualizuj lub rozszerz testy w `tests/local-session.test.ts`.
- [ ] **Step 5:** Uruchom `npm run test` — wszystkie testy na zielono.

---

### Zadanie 3: Integracja z interfejsem użytkownika (`SettingsDialog` i `LocalSessionRecovery`)

Cel: zapewnienie płynnego feedbacku użytkownikowi podczas czyszczenia danych.

**Pliki:**
- Modyfikacja: `components/app-header/settings-dialog.tsx`
- Modyfikacja: `components/local-session-recovery.tsx` (opcjonalnie, jeśli asynchroniczne)

Kroki:
- [ ] **Step 1:** W `components/app-header/settings-dialog.tsx`:
  - Dodaj lokalny stan `isClearing` (`useState(false)`).
  - W `handleClearLocalSession`:
    - Ustaw `setIsClearing(true)`,
    - Wywołaj `await clearLocalSession()`,
    - Wyświetl toast o wyczyszczeniu danych,
    - W bloku `finally` ustaw `setIsClearing(false)`.
  - Zablokuj przycisk, gdy `isClearing === true` lub `!hasLocalSession`.
- [ ] **Step 2:** Uruchom `npm run test` — wszystkie testy na zielono.

---

### Zadanie 4: Weryfikacja i aktualizacja dokumentacji

Cel: upewnienie się, że zachowanie jest udokumentowane w `AGENTS.md` oraz przejście pełnego łańcucha weryfikacji.

**Pliki:**
- Modyfikacja: `AGENTS.md`

Kroki:
- [ ] **Step 1:** W sekcji **State Management** w `AGENTS.md` dopisz informację, że `clearLocalSession` czyści `localStorage` (`autosave` + `position`) oraz osieroconą bazę IndexedDB `subtitle-editor-vimeo-cache`, natomiast **nie** usuwa `subtitle-editor-waveform-cache` (cache pików).
- [ ] **Step 2:** Wykonaj pełny Verification Workflow (`lint`, `format`, `format:check`, `test`, `knip`, `build`).

---

## 5. Ryzyka i świadome decyzje

| Ryzyko / Pytanie projektowe                                                        | Decyzja i mitygacja                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Czy `deleteDatabase` może zablokować się, gdy otwarta jest inna karta?             | Tak, specyfikacja IndexedDB przewiduje zdarzenie `onblocked`. W handlerze dodajemy fallback: jeśli po 1.5 sekundy operacja nadal jest zablokowana, Promise rozwiązuje się sukcesem bez zawieszania aplikacji.                                                                                                 |
| Czy wyczyszczenie IndexedDB psuje aktualnie wyświetlaną falę dźwiękową?            | Nie dotyczy — cache pików nie jest usuwany. WaveSurfer i tak trzyma piki w pamięci komponentu React.                                                                                                                                                                                                          |
| Czy „Discard” w oknie odzyskiwania sesji też powinien czyścić IndexedDB?           | Nie. Odrzucenie przywrócenia sesji nie jest powodem do kasowania cache'u pików — ponowna ekstrakcja dużych plików to minuty pracy (D6 w planie cache'u pików).                                                                                                                                                |
| Czy przycisk w ustawieniach powinien być aktywny, gdy `hasLocalSession === false`? | Pozostawiamy powiązanie z `hasLocalSession` (lub rozważamy opcję włączenia przycisku, jeśli chcemy umożliwić użytkownikowi ręczne zresetowanie cache'u fali nawet bez aktywnego autozapisu). Rekomendacja: utrzymać spójność z obecną etykietą „Local autosave” i czyścić komplet danych przy aktywnej sesji. |

---

## 6. Kryteria akceptacji

- [ ] Wywołanie `clearLocalSession()` (np. przycisk w oknie ustawień) trwale usuwa bazę `subtitle-editor-vimeo-cache` z IndexedDB.
- [ ] Baza `subtitle-editor-waveform-cache` (cache pików) **pozostaje nietknięta** — także po „Discard” w oknie odzyskiwania sesji.
- [ ] Operacja jest w pełni bezpieczna w środowisku SSR, Node.js (test runner) oraz w trybie prywatnym / przy zablokowanym IndexedDB (brak nieobsłużonych wyjątków).
- [ ] Przycisk czyszczenia w ustawieniach obsługuje asynchroniczny stan oczekiwania bez możliwości wielokliku.
- [ ] Wszystkie testy jednostkowe (`npm run test`) przechodzą na zielono.
- [ ] Pełny workflow weryfikacyjny (`lint`, `format:check`, `test`, `knip`, `build`) kończy się z kodem 0.
