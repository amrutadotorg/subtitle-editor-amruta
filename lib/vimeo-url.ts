export function extractVideoId(url: string): string | null {
  // Supports:
  //   https://vimeo.com/123456789
  //   https://vimeo.com/123456789/abcdef1234
  //   https://player.vimeo.com/video/123456789
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
