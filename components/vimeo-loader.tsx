"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCachedFile, setCachedFile } from "@/lib/vimeo-file-cache";
import { IconLoader2, IconDownload } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

function extractVideoId(url: string): string | null {
  const patterns = [
    /vimeo\.com\/(\d+)(?:\/\S*)?$/,
    /player\.vimeo\.com\/video\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

interface VimeoLoaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileLoaded: (file: File) => void;
  onVideoId?: (videoId: string) => void;
}

export default function VimeoLoader({
  open,
  onOpenChange,
  onFileLoaded,
  onVideoId,
}: VimeoLoaderProps) {
  const t = useTranslations();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const handleDownload = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const videoId = extractVideoId(trimmed);
    if (!videoId) {
      setError(t("vimeoLoader.invalidUrl"));
      return;
    }

    // Check IndexedDB cache first
    const cached = await getCachedFile(videoId);
    if (cached) {
      onFileLoaded(cached);
      setUrl("");
      onOpenChange(false);
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(null);

    try {
      const res = await fetch(
        `/api/vimeo/download?url=${encodeURIComponent(trimmed)}`,
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.error === "vimeo") {
          if (body.status === 403)
            throw new Error(t("vimeoLoader.errorForbidden"));
          if (body.status === 404)
            throw new Error(t("vimeoLoader.errorNotFound"));
        }
        throw new Error(t("vimeoLoader.errorGeneric"));
      }

      const contentLength = res.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : null;
      const reader = res.body!.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) setProgress(Math.round((received / total) * 100));
      }

      const filename =
        res.headers
          .get("content-disposition")
          ?.match(/filename="(.+?)"/)?.[1] ?? "vimeo-video.mp4";

      const totalLen = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      const blob = new Blob([merged], {
        type: res.headers.get("content-type") ?? "video/mp4",
      });
      const file = new File([blob], filename, {
        type: res.headers.get("content-type") ?? "video/mp4",
      });

      // Cache in IndexedDB for future restores
      await setCachedFile(videoId, file);

      onVideoId?.(videoId);
      onFileLoaded(file);
      setUrl("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [url, onFileLoaded, onOpenChange, onVideoId, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("vimeoLoader.title")}</DialogTitle>
          <DialogDescription>{t("vimeoLoader.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="vimeo-url">{t("vimeoLoader.urlLabel")}</Label>
          <Input
            id="vimeo-url"
            type="url"
            placeholder="https://vimeo.com/123456789"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim() && !loading) {
                handleDownload();
              }
            }}
            disabled={loading}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {loading && progress !== null && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-iris-800 dark:bg-iris-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right tabular-nums">
              {progress}%
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t("dialog.cancel")}
          </Button>
          <Button
            onClick={handleDownload}
            disabled={!url.trim() || loading}
            className="gap-2"
          >
            {loading ? (
              <IconLoader2 size={16} className="animate-spin" />
            ) : (
              <IconDownload size={16} />
            )}
            {t("vimeoLoader.load")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
