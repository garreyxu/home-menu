const LETTERS = ["a", "b", "c"] as const;

export type FrameLetter = (typeof LETTERS)[number];

/** Stable variant so one card keeps the same hand-drawn frame. */
export function frameLetter(id: string): FrameLetter {
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0)) % 997;
  return LETTERS[hash % LETTERS.length] ?? "a";
}

/** Fixed rotation in the closed range -8° through +6°. */
export function sealRotation(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return -8 + (hash % 15);
}
