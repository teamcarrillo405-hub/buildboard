/** Ensure a URL has a protocol prefix so it opens externally, not as a relative path */
export function ensureUrl(url: string): string {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
