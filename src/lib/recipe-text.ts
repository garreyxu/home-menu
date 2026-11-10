import type { RecipeSpan } from "@/lib/recipe-blocks";
import { HOUR_UNIT, MINUTE_UNIT } from "@/lib/time-units";

const localizedText = new RegExp(
  String.raw`(\d+)\s*${HOUR_UNIT}|(\d+)\s*${MINUTE_UNIT}|[（(]option(?:al)?[）)]`,
  "gi",
);

function replacement(hours?: string, minutes?: string): string {
  return hours ? `${hours} 小时` : minutes ? `${minutes} 分钟` : "（可选）";
}

/** Localize recipe prose for display only; leave the synced body untouched. */
export function normalizeRecipeText(value: string): string {
  return value.replace(localizedText, (_match, hours, minutes) =>
    replacement(hours, minutes),
  );
}

/** Match across Notion's formatting boundaries, retaining the starting span's style. */
export function normalizeRecipeSpans(
  spans: readonly RecipeSpan[],
): RecipeSpan[] {
  const result = spans.map((span) => ({ ...span }));
  const text = spans.map((span) => span.text).join("");
  const offsets: number[] = [];
  let offset = 0;
  for (const span of spans) {
    offsets.push(offset);
    offset += span.text.length;
  }
  // Work backwards so every match still refers to the original text offsets.
  for (const match of [...text.matchAll(localizedText)].reverse()) {
    const start = match.index;
    const end = start + match[0].length;
    for (let index = 0; index < spans.length; index++) {
      const spanStart = offsets[index];
      const spanEnd = spanStart + spans[index].text.length;
      if (spanStart >= end || spanEnd <= start) continue;
      const from = Math.max(0, start - spanStart);
      const to = Math.min(spans[index].text.length, end - spanStart);
      result[index].text =
        result[index].text.slice(0, from) +
        (start >= spanStart ? replacement(match[1], match[2]) : "") +
        result[index].text.slice(to);
    }
  }
  return result;
}
