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
  const safeDirPrefix = baseDir.endsWith("/") ? baseDir : `${baseDir}/`;
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
