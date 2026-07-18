# Plan: Wczytywanie napisów z repo captions (`?caption=`)

Dodanie parametru `?caption=<filename>` umożliwiającego automatyczne załadowanie napisów z repozytorium captions zamontowanego jako volume Docker.

---

## Ocena planu — wyniki przeglądu

Plan jest generalnie dobry i spójny z istniejącą architekturą. Poniżej lista znalezionych problemów wymagających korekty.

---

## Problemy do poprawienia

### 🔴 KRYTYCZNY: Regex nie pasuje do rzeczywistego formatu plików

Plan zakłada format `{id}.{lang}.vtt` gdzie `lang` to dokładnie **2 znaki** (`[a-z]{2}`), ale pliki w repo mogą mieć kod języka `yue` (3 litery).

**Poprawka:** Użyć bardziej elastycznego regexu:
```
/^[a-zA-Z0-9_\-]+\.[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]+)*\.vtt$/
```

---

### 🔴 KRYTYCZNY: Path traversal check podatny na edge case

`filePath.startsWith(baseDir)` może dać false-positive jeśli `baseDir` nie kończy się na `/`.

**Poprawka:** `filePath.startsWith(baseDir + "/")`

---

### 🟡 WAŻNY: Dev path względem `process.cwd()` jest nieprawidłowy

`path.resolve(process.cwd(), "../git/captions")` → `/home/admin/containers/git/captions` — nie istnieje.

**Poprawka:**
```typescript
path.resolve(process.cwd(), "../../git/captions")
// = /home/admin/git/captions ✅
```

---

## Zatwierdzona implementacja (po korektach)

### `docker-compose.yml` — dodaj volume

```yaml
subtitle-dev:
  volumes:
    - .:/app
    - /app/node_modules
    - /app/.next
    - /home/admin/git/captions:/app/captions:ro    # DODAJ

subtitle-prod:
  volumes:
    - /home/admin/git/captions:/app/captions:ro     # DODAJ
```

### `app/api/load-captions/route.ts` — NOWY (z poprawkami)

```typescript
import { type NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fileName = searchParams.get("file");

  if (!fileName) {
    return new NextResponse("Missing file parameter", { status: 400 });
  }

  // Walidacja: format {id}.{lang}.vtt
  // Lang może być 2-3 litery + opcjonalny subtag (np. zh-TW, pt-BR, yue)
  if (
    !/^[a-zA-Z0-9_\-]+\.[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]+)*\.vtt$/.test(fileName) ||
    fileName.includes("..")
  ) {
    return new NextResponse("Invalid file name format", { status: 400 });
  }

  const baseDir =
    process.env.NODE_ENV === "production"
      ? "/app/captions"
      : path.resolve(process.cwd(), "../../git/captions");

  // Path traversal: upewnij się że baseDir kończy się / żeby uniknąć false-positive
  const safeDirPrefix = baseDir.endsWith("/") ? baseDir : baseDir + "/";
  const filePath = path.resolve(baseDir, fileName);

  if (!filePath.startsWith(safeDirPrefix)) {
    return new NextResponse("Access Denied", { status: 403 });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return new NextResponse("File not found", { status: 404 });
    }

    const fileContent = fs.readFileSync(filePath, "utf-8");

    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error reading captions file:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
```

### `components/editor/editor-app.tsx` — minimalne zmiany

Linia ~189 — rozszerzyć warunek:
```typescript
const sharedFile = searchParams.get("import");
const captionFile = searchParams.get("caption");  // DODAJ
if ((sharedFile || captionFile) && !hasImportedRef.current) {  // ZMIEŃ
```

Linia ~200 — wybrać endpoint:
```typescript
const fetchUrl = captionFile
  ? `/api/load-captions?file=${encodeURIComponent(captionFile)}`
  : `/api/load-shared?file=${encodeURIComponent(sharedFile!)}`;
fetch(fetchUrl)
```

Linia ~208 — użyć captionFile jeśli dostępna:
```typescript
let fileName = captionFile ?? sharedFile ?? "";
```

Linia ~271 — dodać cleanup:
```typescript
url.searchParams.delete("import");
url.searchParams.delete("vimeo_id");
url.searchParams.delete("caption");  // DODAJ
```

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

Następnie:
```bash
docker compose build subtitle_editor
docker compose up -d subtitle_editor
docker restart nginx subtitle_editor
```
