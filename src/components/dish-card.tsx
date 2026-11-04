import type { ReactNode } from "react";
import { DishFallback } from "@/components/dish-fallback";
import { Card } from "@/components/ui/card";
import { frameLetter } from "@/lib/frames";
import type { DishIllustration } from "@/lib/illustrations";
import { cn } from "@/lib/utils";

export type DishCardProps = {
  id?: string;
  name: string;
  categoryName: string;
  description?: string | null;
  /**
   * Watercolor at public/illustrations/<notionPageId>-<240|480|960>.webp.
   * Null paints the brush-name fallback. The server only passes a URL
   * when the build-time manifest lists that Notion page.
   */
  illustration?: DishIllustration | null;
  /** Notion 「已尝试?」. Ink tag on the picture. */
  tried?: boolean;
  plannedCount?: number;
  action?: ReactNode;
};

export function DishCard({
  id = "dish",
  name,
  categoryName,
  description = null,
  illustration = null,
  tried = false,
  plannedCount = 0,
  action = null,
}: DishCardProps) {
  const letter = frameLetter(id);
  const note = dishNoteText(description);

  return (
    <Card
      className={cn(
        "frame-card dish-card h-full w-full gap-3 bg-transparent p-3 min-[2560px]:p-4",
        `frame-card-${letter}`,
      )}
    >
      <div className="relative">
        <div
          className="dish-art-clip relative aspect-[4/3]"
          data-asset="dish-illustration"
        >
          {illustration ? (
            <DishArt illustration={illustration} />
          ) : (
            <div className="dish-art absolute inset-0">
              <DishFallback name={name} />
            </div>
          )}
        </div>
        {plannedCount > 0 ? (
          <span className="planned-tag">已点×{plannedCount}</span>
        ) : null}
        {tried ? <span className="tried-tag">做过</span> : null}
      </div>
      <h3 className="dish-name font-brush line-clamp-2 text-sumi">{name}</h3>
      {note ? <p className="dish-note line-clamp-1">{note}</p> : null}
      <p className="dish-category font-brush">{categoryName}</p>
      {action}
    </Card>
  );
}

/**
 * Handwritten notes stay. English Notion timing such as
 * "Prep Time 5 min Cook Time 20 min" is hidden instead of shown raw.
 */
export function dishNoteText(
  description: string | null | undefined,
): string | null {
  const note = description?.replace(/\s+/g, " ").trim() ?? "";
  if (!note || /[A-Za-z]/.test(note)) return null;
  return note;
}

function DishArt({ illustration }: { illustration: DishIllustration }) {
  return (
    // Static 240/480/960 files. The image optimizer would rewrite the srcset.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={illustration.src}
      srcSet={illustration.srcSet}
      sizes={illustration.sizes}
      alt=""
      className="dish-art absolute inset-0 h-full w-full object-contain"
    />
  );
}

export function DishCardSkeleton() {
  return (
    <div
      className="frame-card frame-card-a flex h-full flex-col gap-3 p-3 min-[2560px]:p-4"
      aria-hidden="true"
    >
      <div className="ink-skeleton aspect-[4/3]" />
      <div className="ink-skeleton h-6 w-2/3" />
      <div className="ink-skeleton h-4 w-1/2" />
    </div>
  );
}
