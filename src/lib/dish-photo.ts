/** Turn a private storage key into a same-origin URL. Public URLs are refused. */
export function dishPhotoUrl(
  id: string,
  photoKey: string | null,
): string | null {
  if (!photoKey) return null;
  if (
    photoKey.includes("://") ||
    photoKey.startsWith("/") ||
    photoKey.includes("..")
  ) {
    return null;
  }
  return `/api/photos/${id}`;
}
