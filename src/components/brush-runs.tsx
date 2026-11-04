const LATIN_RUN = /([\u0020-\u007E\u2160-\u217F]+)/;

/** ASCII and Roman numerals use Noto; the brush face keeps the Chinese. */
export function brushRuns(text: string): { text: string; latin: boolean }[] {
  return text
    .split(LATIN_RUN)
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      latin: /^[\u0020-\u007E\u2160-\u217F]+$/.test(part),
    }));
}

export function BrushRuns({ text }: { text: string }) {
  return brushRuns(text).map((part, index) =>
    part.latin ? (
      <span key={index} className="font-sans">
        {part.text}
      </span>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}
