# Plan wdrożenia: powrót do ostatniego napisu (A + C)

> **Dla agentów:** plan wykonawczy krok-po-kroku. Każde zadanie kończy się zielonym `npm run test`.
> Po całości obowiązuje pełny [Verification Workflow](../../../AGENTS.md#verification-workflow).

**Cel:** po przywróceniu autozapisanej sesji edytor ma przewinąć listę do napisu, przy którym
użytkownik ostatnio pracował, i delikatnie go podświetlić — **bez** włączania trybu edycji
i bez autoodtwarzania.

**Definicja „ostatniego napisu” (decyzja produktowa):**

1. Napis, który był aktywny w momencie **pauzy** (ostatni odtwarzany cue) — przypadek główny.
2. Jeśli odtwarzanie nigdy nie ruszyło: ostatni napis, który użytkownik kliknął / edytował
   (interakcja = fokus pola tekstowego, klik wiersza, nawigacja Ctrl+↑/↓, skok z panelu statystyk).
3. Jeśli nic z powyższego: brak znacznika (nic nie przewijamy).

**Architektura (A + C łączone):**

- **A (snapshot):** `LocalSessionSnapshot` dostaje opcjonalne pole `lastPosition`. Dzięki temu
  kopia sesji (łącznie z „Download backup”) jest samowystarczalna i przenośna.
- **C (osobny klucz):** `subtitle-editor:position:v1` w `localStorage` — mały, często aktualizowany
  rekord, kluczowany po „workspace” (`vimeo:<id>` albo nazwa pliku/ścieżki). To on jest
  **źródłem prawdy** przy przywracaniu, bo snapshot nie jest przepisywany przy każdym kliknięciu.
- **Reguła scalania:** przy restore wybieramy świeższy rekord: `positionKey.updatedAt >=
  snapshot.savedAt ? positionKey : snapshot.lastPosition`.
- **Świadomy kompromis:** `lastPosition` **nie** wchodzi do `getLocalSessionSignature()`.
  Gdyby wchodziło, każdy klik w napis serializowałby całą sesję (przy 1000+ cue to kilobajty JSON-a).
  Zamiast tego pozycję zapisujemy osobno (debounce 500 ms) i tylko dokładamy do snapshotu
  w momencie, gdy snapshot i tak jest budowany.

**Tech stack:** TypeScript 6 (strict), React 19 + React Compiler, next-intl, Tailwind v4,
Node test runner (`tsx --test`), jsdom + `tests/helpers/render.ts`.

---

## Zakres

W zakresie:

- zapis/odczyt pozycji (uuid + time + indeks + znacznik czasu) w `localStorage`,
- pole `lastPosition` w snapshocie + kompatybilność wsteczna (stare snapshoty parsują się bez zmian),
- wykrywanie pozycji na pauzie oraz na interakcji z napisem,
- po „Restore”: scroll (wycentrowanie) + `playbackTime` ustawiony na zapamiętany czas (bez autoplay),
- podświetlenie wiersza (obwódka + `sr-only` opis) znikające przy pierwszej interakcji,
- czyszczenie pozycji razem z „Discard” i „Clear autosave”,
- testy jednostkowe + komponentowy test podświetlenia,
- klucz i18n w `en`/`pl`/`de`/`yue` (test parity sprawdza tylko te cztery; reszta locale
  dostaje fallback do `en` przez deep-merge w `i18n/`).

Poza zakresem:

- synchronizacja pozycji między urządzeniami / kontami (wymaga API + SSO — osobny projekt),
- śledzenie „sprawdzone/do sprawdzenia” per cue (wariant D),
- przywracanie plików lokalnych bez ponownego wyboru pliku przez użytkownika,
- wiele kart przeglądarki naraz (last-writer-wins, patrz Ryzyka),
- przycisk „wróć do ostatniego napisu” w nagłówku (możliwy follow-up, nie teraz).

---

## Gaps & Nuances (zweryfikowane w kodzie)

Cztery szczegóły, które w pierwotnym tekście były niejednoznaczne. Każdy sprawdzony
w źródłach — z dokładną instrukcją wykonania.

### N1 — `sr-only` w `SubtitleItem` a siatka CSS Grid

`.subtitle-row` to `grid` z kolumnami `grid-cols-[1rem_7rem_5rem_1fr]` (`subtitle-item.tsx:203`),
a pierwszym dzieckiem jest `<div className="text-sm font-mono">{subtitle.id}</div>`.

**Ustalenie:** kolumny **nie** pękną, bo `.sr-only` w `app/globals.css:676-686` ma
`position: absolute`, a elementy absolutnie pozycjonowane wewnątrz grid containera nie są
elementami siatki (nie biorą udziału w auto-placement). To jednak zależy od szczegółu
implementacji utility — jeśli ktoś kiedyś podmieni `.sr-only` na wariant `position: static`
(klasyczny `visually-hidden` z `clip-path`), siatka się rozjedzie, a przyczyna będzie nieoczywista.

**Instrukcja:** umieść znacznik **wewnątrz kontenera pierwszej kolumny**, obok numeru cue:

```tsx
<div className="text-sm font-mono">
  {subtitle.id}
  {isResumeTarget ? (
    <span className="sr-only">{t("localSession.resumeMarker")}</span>
  ) : null}
</div>;
```

Nie dodawaj `<span>` jako bezpośredniego dziecka `.subtitle-row` i nie zmieniaj definicji
`grid-cols-*`. Test w Zadaniu 8 (Step 3) sprawdza atrybut `data-resume` i obecność tekstu —
**nie** liczbę dzieci siatki.

### N2 — `subtitleTimings` nie jest dostępne w `editor-app.tsx`

**Ustalenie:** potwierdzone — `editor-app.tsx` importuje tylko `useSubtitleActionsContext`,
`useSubtitleHistory`, `useSubtitleState`, `useSubtitles` (linie 19-22). `useSubtitleTimings`
trzeba dodać jawnie.

**Instrukcja:** w Zadaniu 5, przed użyciem `resolveResumeUuid`, dopisz do importu z
`@/context/subtitle` symbol `useSubtitleTimings`, a w ciele komponentu:

```ts
const { list: subtitleTimings } = useSubtitleTimings();
```

Typ wpisu to `{ uuid: string; start: number; end: number }` (`SubtitleTimingEntry` w
`context/subtitle/types.ts:59-63`) — dokładnie to, czego oczekuje `resolveResumeUuid`.
Uwaga: `timingState` w providerze liczy się z `activeSubtitles` (`provider.tsx:225-233`),
czyli **tylko dla aktywnej ścieżki** — patrz N4.

### N3 — brak inicjalizacji stanu `resumeTarget` w orkiestracji

**Ustalenie:** trafne — w Zadaniu 3 pojawiało się `setResumeTarget(merged)` bez deklaracji
stanu ani funkcji czyszczącej.

**Instrukcja:** w `hooks/use-local-session-orchestration.ts`, obok istniejących
`useState` (linie 60-67):

```ts
const [resumeTarget, setResumeTarget] = useState<ResumeCandidate | null>(null);
const clearResumeTarget = useCallback(() => setResumeTarget(null), []);
```

Następnie: dodaj oba pola do `LocalSessionOrchestrationResult` (linie 38-48), zwróć je
w obiekcie na końcu hooka (linie 219-229), rozszerz `LocalSessionValue` w
`context/subtitle/types.ts:47-57` i dopisz do `localSessionValue` + tablicy zależności
`useMemo` w `provider.tsx:235-258` oraz do destrukturyzacji na liniach 113-122.
`resumeTarget` ustawiaj też na `null` w `discardLocalSession()` i `clearLocalSession()`.

### N4 — pozycja z innej ścieżki niż przywrócona (znalezione przy weryfikacji)

`timingState` liczy się wyłącznie z aktywnej ścieżki. Scenariusz: użytkownik pauzuje na
cue ze ścieżki A, przełącza się na ścieżkę B, autosave zapisuje `activeTrackId = B`,
a pozycja w `position:v1` nadal ma `trackId = A`. Po restore `resolveResumeUuid` nie znajdzie
uuid w timingach B i znacznik zniknie bez ostrzeżenia.

**Instrukcja:** decyzję podejmuj w orkiestracji, gdzie dostępne są wszystkie przywrócone
ścieżki (bez wyścigu z re-renderem). Logika **nie** może być inline — wyciągnij ją do
`selectResumeTrackId` (patrz „Model danych” i Zadanie 1), żeby dała się przetestować bez providera:

```ts
const resumeTrackId = selectResumeTrackId(
  snapshot.tracks,
  merged,
  snapshot.activeTrackId,
);
```

`resumeTrackId` ma dwie konsekwencje w `restoreLocalSession()`:

- nadpisuje `activeTrackId` (zamiast wyłącznie `pendingLocalSession.activeTrackId`),
- trafia do `resumeTarget`, więc `resolveResumeUuid` liczy się już na timingach właściwej ścieżki
  (invariant, patrz „Model danych”).

Dopisz przypadki do testów `selectResumeTrackId` (Zadanie 8) i do manualnego QA (punkt 10 niżej).
Świadoma zmiana zachowania: pozycja wygrywa ze `snapshot.activeTrackId` — użytkownik, który
przełączył ścieżkę przed zamknięciem, wraca do miejsca pracy, nie do ostatnio oglądanej ścieżki.

---

## Model danych

Nowy plik `lib/last-position.ts`:

```ts
export interface ResumeCandidate {
  uuid: string;
  trackId: string | null;
  cueIndex: number; // pozycja w tablicy subtitles w chwili zapisu (fallback)
  cueStart: number; // sekundy, fallback gdy uuid zniknął
  time: number; // sekundy, playbackTime w chwili zapisu
  updatedAt: number; // ms epoch
}

export const LAST_POSITION_STORAGE_KEY = "subtitle-editor:position:v1";
export const LAST_POSITION_SCHEMA_VERSION = 1;
export const LAST_POSITION_MAX_ENTRIES = 10;
export const LAST_POSITION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

interface LastPositionStore {
  schemaVersion: 1;
  entries: Record<string, ResumeCandidate>; // workspaceKey -> candidate
}
```

Eksporty (wszystkie użyte — knip musi być czysty):

```ts
buildWorkspaceKey(input: { vimeoVideoId: string | null; trackName: string | null }): string
parseLastPositionStore(raw: string): LastPositionStore | null
readLastPosition(workspaceKey: string, storage?: LocalSessionStorage | null): ResumeCandidate | null
writeLastPosition(workspaceKey: string, candidate: ResumeCandidate, storage?: LocalSessionStorage | null): boolean
clearLastPosition(workspaceKey?: string | null, storage?: LocalSessionStorage | null): boolean
pruneLastPositionStore(store: LastPositionStore, now: number): LastPositionStore
resolveResumeCandidate(
  fromStore: ResumeCandidate | null,
  fromSnapshot: ResumeCandidate | undefined,
  snapshotSavedAt: number,
): ResumeCandidate | null
resolveResumeUuid(
  candidate: ResumeCandidate,
  timings: ReadonlyArray<{ uuid: string; start: number }>,
  toleranceSeconds?: number, // domyślnie 0.3
): string | null
selectResumeTrackId(
  tracks: ReadonlyArray<{ id: string; subtitles: ReadonlyArray<{ uuid: string }> }>,
  candidate: ResumeCandidate | null,
  fallbackActiveTrackId: string | null,
): string | null
```

`buildWorkspaceKey`: `vimeo:<id>` gdy jest `vimeoVideoId`, inaczej
`track:` + `trackName.trim().toLowerCase().replace(/\s+/g, " ")` (puste → `track:untitled`).
Nazwa ścieżki jest ustawiana nazwą pliku przy imporcie (`renameTrack` w `subtitle-list.tsx:173`),
więc klucz naturalnie działa dla „ten sam plik później”.

`resolveResumeUuid` — łańcuch fallbacków: dokładny `uuid` → najbliższy `start` w tolerancji →
`timings[cueIndex]` (clamp do zakresu) → `null`.

> **Invariant (N2/N4):** `timings` dotyczą **jednej** ścieżki — tej aktywnej
> (`provider.tsx:225-233`). `resolveResumeUuid` nie wie o ścieżkach i nie może ich przełączać.
> Kolejność jest obowiązkowa: **najpierw** `selectResumeTrackId`, **potem** `resolveResumeUuid`
> na timingach wybranej ścieżki.

`selectResumeTrackId` — zwraca `candidate.trackId`, jeśli taka ścieżka istnieje **i** zawiera
`candidate.uuid`; inaczej `fallbackActiveTrackId`, jeśli istnieje; inaczej `tracks[0]?.id ?? null`.
Funkcja czysta (bez providera), więc testowalna jednostkowo — celowo wyciągnięta z hooka.

`resolveResumeCandidate` — porównuje `updatedAt` rekordu z `savedAt` snapshotu; przy remisie
wygrywa rekord z klucza (świeższy zapis pozycji), a gdy oba są `null`/niepoprawne → `null`.

---

## Zadania

### Zadanie 1: biblioteka pozycji

**Pliki:**

- Utwórz: `lib/last-position.ts`
- Zmodyfikuj: `lib/local-session.ts` (eksport `LocalSessionStorage`, żeby nie duplikować interfejsu)

- [ ] **Step 1:** Wyeksportuj `LocalSessionStorage` z `lib/local-session.ts`
  (`export interface LocalSessionStorage { ... }`).
- [ ] **Step 2:** Zaimplementuj `lib/last-position.ts` zgodnie z modelem danych. Walidacja jak
  w `parseLocalSessionSnapshot`: `isRecord`, `Number.isFinite`, odrzucanie niepoprawnych wpisów
  **per wpis** (jeden zepsuty rekord nie psuje całego store'a).
- [ ] **Step 3:** Zaimplementuj `selectResumeTrackId` jako **czystą** funkcję (N4): brak zależności
  od Reacta/providera, wejście tylko `tracks` + kandydat + fallback. Przy okazji dopisz komentarz
  o invariancie przy `resolveResumeUuid` („timings = jedna, aktywna ścieżka”).
- [ ] **Step 4:** `pruneLastPositionStore` usuwa wpisy starsze niż `LAST_POSITION_MAX_AGE_MS`
  i przycina do `LAST_POSITION_MAX_ENTRIES` najnowszych `updatedAt`.
- [ ] **Step 5:** `writeLastPosition` czyta istniejący store, dokłada/aktualizuje wpis, przycina,
  zapisuje w `try/catch` (quota exceeded → `false`, jak w `local-session.ts`).
- [ ] **Step 6:** Uruchom `npx tsc --noEmit` (albo `npm run build` później) — brak błędów typów.

### Zadanie 2: snapshot

**Pliki:**

- Zmodyfikuj: `lib/local-session.ts`

- [ ] **Step 1:** Dodaj do `LocalSessionSnapshot`: `lastPosition?: ResumeCandidate`.
- [ ] **Step 2:** `CreateLocalSessionSnapshotInput` dostaje `lastPosition?: ResumeCandidate`;
  `createLocalSessionSnapshot` przepisuje go **klonem** (bez referencji do obiektu z zewnątrz).
- [ ] **Step 3:** `parseLocalSessionSnapshot` waliduje `lastPosition` przez `parseResumeCandidate`
  (wyeksportuj go z `lib/last-position.ts`); **niepoprawne pole → `undefined`, nie odrzucenie sesji**.
  `schemaVersion` zostaje `1` (pole opcjonalne, stare snapshoty nadal parsują się bez zmian).
- [ ] **Step 4:** Dodaj komentarz przy `getLocalSessionSignature`:
  „`lastPosition` celowo poza sygnaturą — patrz plan 2026-11-09, sekcja Architektura”.

### Zadanie 3: orkiestracja sesji

**Pliki:**

- Zmodyfikuj: `hooks/use-local-session-orchestration.ts`
- Zmodyfikuj: `context/subtitle/types.ts`
- Zmodyfikuj: `context/subtitle/provider.tsx`

- [ ] **Step 1:** `createCurrentLocalSession` dokłada
  `lastPosition: readLastPosition(currentWorkspaceKey) ?? undefined`. Klucz wyliczaj przez
  `useMemo` z `buildWorkspaceKey({ vimeoVideoId, trackName: nazwa aktywnej ścieżki ?? pierwszej })`.
- [ ] **Step 2:** `restoreLocalSession()` — kolejność jest istotna (invariant z N4):
  1. wylicz klucz workspace z **przywróconego** snapshotu,
  2. `const merged = resolveResumeCandidate(readLastPosition(key), snapshot.lastPosition, snapshot.savedAt)`,
  3. `const resumeTrackId = selectResumeTrackId(snapshot.tracks, merged, snapshot.activeTrackId)`
     (N4 — czysta funkcja z Zadania 1; **nie** duplikuj tej logiki inline w hooku),
  4. `setActiveTrackId(resumeTrackId)` — zamiast dotychczasowego wyłącznie
     `pendingLocalSession.activeTrackId`,
  5. `setResumeTarget(merged)`.
- [ ] **Step 3:** Zadeklaruj stan i funkcję czyszczącą (N3) — obok `useState` w liniach 60-67:

  ```ts
  const [resumeTarget, setResumeTarget] = useState<ResumeCandidate | null>(null);
  const clearResumeTarget = useCallback(() => setResumeTarget(null), []);
  ```

- [ ] **Step 4:** Dodaj do interfejsu `LocalSessionOrchestrationResult` i do obiektu zwracanego
  przez hook: `resumeTarget`, `clearResumeTarget`. Rozszerz `LocalSessionValue`
  (`context/subtitle/types.ts:47-57`) o `resumeTarget: ResumeCandidate | null` i
  `clearResumeTarget: () => void`.
- [ ] **Step 5:** `discardLocalSession()` → `clearLastPosition(key)` + `setResumeTarget(null)`.
  `clearLocalSession()` → `clearLastPosition()` (bez argumentu = czyści cały store) +
  `setResumeTarget(null)`.
- [ ] **Step 6:** Podłącz nowe pola w `provider.tsx`: destrukturyzacja w liniach 113-122,
  wpis w `localSessionValue` (`useMemo`, linie 235-258) razem z tablicą zależności
  (`resumeTarget`, `clearResumeTarget`).

### Zadanie 4: hook zbierający pozycję

**Pliki:**

- Utwórz: `hooks/use-resume-cursor.ts`

```ts
interface UseResumeCursorParams {
  enabled: boolean; // pendingLocalSession === null && subtitles.length > 0
  workspaceKey: string;
  isPlaying: boolean;
  playbackTime: number;
  hasMedia: boolean; // mediaFile || vimeoVideoId
  subtitles: Subtitle[];
  trackId: string | null;
  subtitleTimings: SubtitleTimingEntry[]; // z useSubtitleTimings().list
  suppressed: boolean; // tuż po restore, patrz Zadanie 5
}
returns { recordInteraction: (uuid: string) => void; flush: () => void };
```

- [ ] **Step 1:** Efekt „pauza/seek”: gdy `!isPlaying`, `enabled` i `!suppressed`, znajdź indeks
  przez `findActiveSubtitleIndex(subtitleTimings, playbackTime, -1)`. `index < 0` → **nic nie rób**
  (nie nadpisuj ostatniej pozycji luką między napisami).
- [ ] **Step 2:** Guard początkowy: nie zapisuj, gdy `playbackTime === 0 && !hasMedia`
  (inaczej pusty edytor zapisze cue #1 przed przywróceniem sesji).
- [ ] **Step 3:** `recordInteraction(uuid)` buduje kandydata z `cueIndex`,
  `cueStart` i `time = getCuePreviewSeekTime(start, end)` (`lib/subtitle-playback.ts`).
- [ ] **Step 4:** Zapis przez `setTimeout` 500 ms, kasowany przy kolejnej zmianie (debounce);
  `flush()` zapisuje natychmiast i czyści timer.
- [ ] **Step 5:** `window.addEventListener("pagehide", flush)` + cleanup. `visibilitychange`
  nie jest potrzebne (`playInBackground` obsługuje pauzę, a `pagehide` pokrywa zamknięcie karty).

### Zadanie 5: podłączenie w edytorze

**Pliki:**

- Zmodyfikuj: `components/editor/editor-app.tsx`

- [ ] **Step 1:** `const { resumeTarget, clearResumeTarget } = useLocalSession();`
  `const workspaceKey = useMemo(() => buildWorkspaceKey({ vimeoVideoId, trackName: activeTrack?.name ?? null }), [...])`.
- [ ] **Step 2:** Dodaj do importu z `@/context/subtitle` symbol `useSubtitleTimings` (N2)
  i w ciele komponentu: `const { list: subtitleTimings } = useSubtitleTimings();`.
  Stan: `const [resumeUuid, setResumeUuid] = useState<string | null>(null)` +
  `const resumeSuppressUntilRef = useRef(0)`. `<SubtitleListRef>`/`requestScroll` już są
  dostępne — bez nowych zależności.
- [ ] **Step 3:** Efekt po `resumeTarget`:

  ```ts
  const uuid = resolveResumeUuid(resumeTarget, subtitleTimings);
  resumeSuppressUntilRef.current = Date.now() + 1500;
  if (resumeTarget.time > 0) setPlaybackTime(resumeTarget.time); // BEZ setIsPlaying
  if (uuid) {
    setResumeUuid(uuid);
    requestScroll(uuid, { instant: true });
  }
  clearResumeTarget();
  ```

  `suppressed` dla hooka: `Date.now() < resumeSuppressUntilRef.current`. Ponieważ ref nie
  powoduje re-renderu, dodatkowo trzymaj `const [resumeSuppressed, setResumeSuppressed] = useState(false)`
  i zdejmij po 1500 ms (`setTimeout` w tym samym efekcie).
- [ ] **Step 4:** Hook: `const { recordInteraction } = useResumeCursor({...})`.
- [ ] **Step 5:** Efekt `useEffect(() => { if (editingSubtitleUuid) { recordInteraction(editingSubtitleUuid); setResumeUuid(null); } }, [editingSubtitleUuid])`
  — to pokrywa fokus pola tekstowego, Ctrl+↑/↓ i dodanie/split cue.
- [ ] **Step 6:** `navigateToSubtitle(uuid)` → `recordInteraction(uuid); setResumeUuid(null);`
  (klik w listę, klik regionu waveform, skok z panelu statystyk).
- [ ] **Step 7:** `useEffect(() => setResumeUuid(null), [activeTrackId])` — przełączenie ścieżki
  zdejmuje podświetlenie.
- [ ] **Step 8:** Przekaż `resumeUuid` do `TrackTabs` (nowy prop), tylko dla aktywnej ścieżki.

> **Uwaga (pułapka z audytu kodu):** `onTimeSync` w `editor-app.tsx:229` robi
> `setEditingSubtitleUuid(null)` przy każdym ticku odtwarzania, więc `editingSubtitleUuid`
> **nie** jest „kursorem”. Nie buduj na nim pozycji — źródłem jest pauza + `playbackTime`.

### Zadanie 6: prop drilling i podświetlenie

**Pliki:**

- Zmodyfikuj: `components/subtitle/track-tabs.tsx`
- Zmodyfikuj: `components/subtitle/subtitle-list.tsx`
- Zmodyfikuj: `components/subtitle/subtitle-item.tsx`
- Zmodyfikuj: `app/globals.css`

- [ ] **Step 1:** `TrackTabsProps` + `SubtitleListProps`: `resumeUuid: string | null`.
  W `TrackTabs` przekazuj `resumeUuid={track.id === activeTrackId ? resumeUuid : null}`.
- [ ] **Step 2:** `SubtitleItem`: prop `isResumeTarget: boolean`. Na wierszu:
  `data-resume={isResumeTarget ? "true" : undefined}`. Opis dla czytnika ekranu umieść
  **wewnątrz kontenera pierwszej kolumny** (N1), nie jako bezpośrednie dziecko `.subtitle-row`:

  ```tsx
  <div className="text-sm font-mono">
    {subtitle.id}
    {isResumeTarget ? (
      <span className="sr-only">{t("localSession.resumeMarker")}</span>
    ) : null}
  </div>
  ```
- [ ] **Step 3:** `app/globals.css`, w `@layer components`, po regule `[data-current="true"]`:

  ```css
  /* ostatnia pozycja z poprzedniej sesji: przerywana obwódka, widoczna też w dark mode */
  .subtitle-row[data-resume="true"] {
    outline: 2px dashed var(--iris-9);
    outline-offset: -2px;
  }
  ```

  Obwódka jest symetryczna, więc RTL nie wymaga osobnej reguły (inaczej niż `box-shadow`).
- [ ] **Step 4:** Sprawdź wizualnie, że podświetlenie nie konkuruje z `data-current`
  (tło + lewy pasek ścieżki zostają; obwódka rysuje się na krawędzi).

### Zadanie 7: i18n

**Pliki:**

- Zmodyfikuj: `messages/en.json`, `messages/pl.json`, `messages/de.json`, `messages/yue.json`

- [ ] **Step 1:** W sekcji `localSession` dodaj `"resumeMarker"`:
  - en: `"Last place you worked"`
  - pl: `"Miejsce, w którym skończyłeś"`
  - de: `"Zuletzt bearbeitete Stelle"`
  - yue: `"上次做到嘅位置"`
- [ ] **Step 2:** `npm run test` — `tests/locale-parity.test.ts` musi przejść
  (inne locale korzystają z fallbacku do `en`, więc ich nie ruszamy).

### Zadanie 8: testy

**Pliki:**

- Utwórz: `tests/last-position.test.ts`
- Utwórz: `tests/subtitle-resume-highlight.test.ts`
- Zmodyfikuj: `tests/local-session.test.ts`

- [ ] **Step 1:** `tests/last-position.test.ts` (in-memory storage, jak w `local-session.test.ts`):
  1. `writeLastPosition`/`readLastPosition` round-trip i zachowanie innych wpisów,
  2. `parseLastPositionStore` odrzuca zły JSON, zły `schemaVersion`, wpisy z błędnymi typami
     (per-wpis, reszta zostaje),
  3. `pruneLastPositionStore` usuwa wpisy > 90 dni i przycina do 10 najnowszych,
  4. `buildWorkspaceKey` preferuje `vimeo:` i normalizuje nazwę (`" My File.vtt "` → `track:my file.vtt`),
  5. `resolveResumeCandidate` wybiera świeższy rekord, obsługuje `null` po obu stronach,
  6. `resolveResumeUuid`: dokładny uuid → tolerancja `cueStart` → clamp `cueIndex` → `null`.
- [ ] **Step 2:** `selectResumeTrackId` (N4 — sedno regresji, bez providera):
  7. kandydat z innej ścieżki niż `fallbackActiveTrackId`, ale jego `uuid` istnieje w tej
  ścieżce → zwraca `candidate.trackId` (pozycja wygrywa),
  8. kandydat wskazuje istniejącą ścieżkę, ale `uuid` w niej **nie** istnieje → zwraca
  `fallbackActiveTrackId`,
  9. `candidate.trackId` nie istnieje w `tracks` (ścieżka usunięta) → `fallbackActiveTrackId`,
  10. `candidate === null` → `fallbackActiveTrackId`; brak fallbacku → `tracks[0]?.id`;
  puste `tracks` → `null`.
- [ ] **Step 3:** `tests/local-session.test.ts`:
  11. snapshot z `lastPosition` przechodzi round-trip,
  12. snapshot **bez** `lastPosition` nadal się parsuje (kompatybilność wsteczna),
  13. niepoprawny `lastPosition` jest pomijany, ale snapshot zostaje zaakceptowany,
  14. **regresja:** `getLocalSessionSignature` nie zmienia się, gdy zmienia się wyłącznie
  `lastPosition`.
- [ ] **Step 4:** `tests/subtitle-resume-highlight.test.ts` (wzór: `tests/subtitle-item-focus.test.ts`,
  `createElement` + `renderWithIntl`, `.test.ts` bo `npm run test` łapie tylko `*.test.ts`):
  15. `isResumeTarget` ustawia `data-resume="true"` i renderuje `sr-only` z tekstem z `en.json`,
  16. bez flagi atrybutu nie ma.

### Zadanie 9: dokumentacja

**Pliki:**

- Zmodyfikuj: `messages/en.json` (opis w settings) — opcjonalne
- Zmodyfikuj: `AGENTS.md` — dopisz jedno zdanie w „State Management”

- [ ] **Step 1:** W `AGENTS.md` przy `Local session`: „Pozycja ostatniej pracy (pauza/interakcja)
  jest trzymana w `subtitle-editor:position:v1` i dokładana do snapshotu jako `lastPosition`;
  nie wchodzi do `getLocalSessionSignature()`.”

---

## Weryfikacja

```bash
npm run lint
npm run format
npm run format:check
npm run test
npm run knip
npm run build
```

Ręczny QA (na `npm run dev`, przeglądarka z otwartymi DevTools → Application → Local Storage):

1. Edytuj cue 42 → zamknij kartę → otwórz → **Restore**: lista wycentrowana na 42,
   przerywana obwódka, kursor **nie** w polu tekstowym, odtwarzanie zatrzymane.
2. Odtwórz 30 s i zapauzuj na cue 15 → przeładuj → **Restore**: `playbackTime` = moment pauzy,
   podświetlony cue 15.
3. Usuń cue 15, ustaw w `subtitle-editor:position:v1` jego uuid → przeładuj → **Restore**:
   fallback po `cueStart` (najbliższy napis), bez błędów w konsoli.
4. **Discard** → klucz `subtitle-editor:position:v1` wyczyszczony, brak podświetlenia.
5. Ustawienia → **Clear autosave** → klucz wyczyszczony, brak podświetlenia.
6. Dwa projekty: import A (stop na cue 10), import B (stop na cue 5), ponowny import A →
   powrót do cue 10 (klucz po nazwie pliku).
7. Tryb ciemny: obwódka widoczna (token `--iris-9` ma wariant dark).
8. Czytnik ekranu / inspekcja a11y: wiersz ma `sr-only` opis, brak zmian w nawigacji Tab.
9. Regresja: zwykłe odtwarzanie, `onTimeSync`, auto-scroll podczas playbacku i Ctrl+↑/↓
   działają jak wcześniej; po pierwszym kliknięciu obwódka znika.
10. **N4:** dwie ścieżki — zapauzuj na cue ze ścieżki A, przełącz na B, odczekaj >750 ms
    (autosave), przeładuj → **Restore**: aktywna staje się ścieżka A, lista wycentrowana na
    właściwym cue. Gdy cue z pozycji został usunięty, restore zostaje na ścieżce ze snapshotu
    i nie przewija (bez błędu w konsoli).

---

## Ryzyka i świadome decyzje

| Ryzyko                                                                  | Mitygacja                                                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Kursor nadpisany cue #1 tuż po restore                                  | `suppressed` przez 1,5 s + guard `playbackTime === 0 && !hasMedia` + ustawienie `playbackTime` z kandydata |
| Snapshot ma nieświeżą pozycję (nie jest przepisywany przy kliknięciach) | źródłem prawdy jest klucz `position:v1`; snapshot to fallback i część backupu                              |
| Duży projekt = kosztowna serializacja                                   | pozycja poza sygnaturą, osobny mały rekord (~200 B), debounce 500 ms                                       |
| `uuid` znika po ponownym imporcie / usunięciu cue                       | fallback: `cueStart` w tolerancji 0,3 s → `cueIndex` (clamp)                                               |
| Dwie karty naraz                                                        | last-writer-wins; poza zakresem, udokumentowane                                                            |
| Kolizja nazw plików w kluczu workspace                                  | akceptowane (ten sam plik = ten sam klucz); przy kolizji wracamy do ostatniej pozycji „tej nazwy”          |
| Wpis pozostaje po usunięciu projektu                                    | TTL 90 dni + limit 10 wpisów + czyszczenie przy `Clear autosave`                                           |
| Pozycja ze ścieżki innej niż przywrócona (N4)                           | wybór ścieżki w orkiestracji: pozycja wygrywa tylko gdy `uuid` istnieje w tej ścieżce                      |
| Podświetlenie mylone z aktywnym cue                                     | inny styl (przerywana obwódka) niż `data-current` (tło + pasek ścieżki)                                    |

## Kryteria akceptacji

- [ ] Po **Restore** lista jest wycentrowana na ostatnio odtwarzanym (pauza) lub edytowanym napisie.
- [ ] Napis ma widoczne, theme-aware podświetlenie i `sr-only` opis; tryb edycji **nie** startuje.
- [ ] `playbackTime` wraca do momentu pauzy, odtwarzanie pozostaje zatrzymane.
- [ ] `Discard` i `Clear autosave` czyszczą pozycję; brakujące cue nie wywala restore.
- [ ] Stare snapshoty (bez `lastPosition`) parsują się; sygnatura sesji nie zależy od pozycji.
- [ ] Wszystkie kroki Verification Workflow zielone, `knip` bez nowych zgłoszeń.

---

## Notatki z implementacji (2026-11-10)

Plan zrealizowany; poniżej świadome odstępstwa od pierwotnego tekstu.

1. **`readFreshestLastPosition(workspaceKeys)` zamiast `readLastPosition(activeKey)`.**
   Klucz pozycji jest wyliczany z nazwy aktywnej ścieżki, więc przełączenie ścieżki zmienia
   klucz — a pozycja zostaje pod starym. Odczyt „najświeższego z wszystkich ścieżek projektu”
   domyka tę lukę w wariancie A+C (N4) bez polegania wyłącznie na `snapshot.lastPosition`.
2. **`discardLocalSession()` czyści pozycje wszystkich kluczy bieżącego projektu**
   (vimeo id albo nazwy wszystkich ścieżek), nie tylko aktywnej. `clearLocalSession()` nadal
   usuwa cały store (`clearLastPosition()` bez argumentu).
3. **Jedna hooka `hooks/use-resume-cursor.ts`** obsługuje zapis i restore (wspólny stan
   `suppressed`); `hooks/use-resume-cursor.ts` dopisany do listy plików z wyłączonym
   `react-hooks/set-state-in-effect` (12 plików — zaktualizowane w `AGENTS.md`).
4. **`suppressedRef`** ustawiany synchronicznie w efekcie restore, bo efekty tego samego
   commita widzą jeszcze stare `suppressed` ze stanu.
5. **`SubtitleTimingEntry` wyeksportowany** z `context/subtitle/types.ts` (używany w sygnaturze hooka).
6. Testy: 218 przechodzi (dodane `tests/last-position.test.ts`, `tests/subtitle-resume-highlight.test.ts`
   oraz 4 przypadki w `tests/local-session.test.ts`).
