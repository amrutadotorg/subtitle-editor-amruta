import { type NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fileName = searchParams.get("file");

  if (!fileName) {
    return new NextResponse("Missing file parameter", { status: 400 });
  }

  // Path Traversal protection: allow only format "subdirectory/filename.vtt" or "filename.vtt"
  if (!/^[a-zA-Z0-9_\-\/]+\.(vtt|srt)$/.test(fileName) || fileName.includes("..")) {
    return new NextResponse("Invalid file name format", { status: 400 });
  }

  // The shared volume is mounted at /app/shared_uploads in Docker
  const baseDir = process.env.NODE_ENV === "production" 
    ? "/app/shared_uploads" 
    : path.resolve(process.cwd(), "shared_uploads");

  // Resolve absolute path to ensure no hidden directory traversal
  const filePath = path.resolve(baseDir, fileName);

  // Verify that the target file path resides inside the base directory
  if (!filePath.startsWith(baseDir)) {
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
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error reading shared subtitle file:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
