/** Display-only cleanup for Notion metadata; stored values stay untouched.
 * `option` in select metadata is a default label, not an ingredient modifier.
 */
export function displayField(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || /^(?:n\/a|na|-|option)$/i.test(text)) return null;
  return value!;
}

/** Take whole graphemes, including joined emoji and combining accents. */
export function placeholderInitials(name: string): string {
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segments.segment(name.trim()), ({ segment }) => segment)
    .slice(0, 2)
    .join("");
}
