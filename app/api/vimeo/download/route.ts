import { NextRequest, NextResponse } from "next/server";
import { extractVideoId } from "@/lib/vimeo-url";
import { verifySsoApi } from "@/lib/sso";

export { extractVideoId };

export async function GET(request: NextRequest) {
  const ssoResponse = await verifySsoApi(request);
  if (ssoResponse) return ssoResponse;

  const token = process.env.VIMEO_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Vimeo token not configured" },
      { status: 500 },
    );
  }

  const videoUrl = request.nextUrl.searchParams.get("url");
  if (!videoUrl) {
    return NextResponse.json(
      { error: "Missing 'url' query parameter" },
      { status: 400 },
    );
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return NextResponse.json(
      { error: "Could not extract video ID from URL" },
      { status: 400 },
    );
  }

  // Fetch video metadata from Vimeo API
  const metaRes = await fetch(
    `https://api.vimeo.com/videos/${videoId}?fields=download,name`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!metaRes.ok) {
    const detail = await metaRes.text();
    return NextResponse.json(
      { error: "vimeo", status: metaRes.status, detail },
      { status: metaRes.status },
    );
  }

  const meta = await metaRes.json();
  const files: Array<{
    quality: string;
    width?: number;
    type: string;
    link?: string;
  }> = meta.download ?? [];

  // Pick best quality (HD > SD), fallback to first available
  const sorted = [...files].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const file = sorted[0];

  if (!file?.link) {
    return NextResponse.json(
      { error: "No downloadable file available" },
      { status: 404 },
    );
  }

  // Stream the file through proxy — token never reaches the client
  const upstream = await fetch(file.link);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Failed to download from Vimeo" },
      { status: 502 },
    );
  }

  const filename = `${meta.name ?? videoId}.mp4`;
  const contentLength = upstream.headers.get("content-length");

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": file.type ?? "video/mp4",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      ...(contentLength ? { "Content-Length": contentLength } : {}),
    },
  });
}
