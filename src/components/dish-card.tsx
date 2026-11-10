import type { ReactNode } from "react";
import { BrushRuns } from "@/components/brush-runs";
import { DishFallback } from "@/components/dish-fallback";
import { Card } from "@/components/ui/card";
import { frameLetter } from "@/lib/frames";
import type { DishIllustration } from "@/lib/illustrations";
import { cn } from "@/lib/utils";

export type DishCardProps = {
  id?: string;
  name: string;
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
  onOpenRecipe?: () => void;
};

export function DishCard({
  id = "dish",
  name,
  illustration = null,
  tried = false,
  plannedCount = 0,
  action = null,
  onOpenRecipe,
}: DishCardProps) {
  const letter = frameLetter(id);

  return (
    <Card
      className={cn(
        "frame-card dish-card h-full w-full gap-3 bg-transparent p-3 min-[2560px]:p-4",
        `frame-card-${letter}`,
      )}
    >
      <div className="relative">
        <button
          type="button"
          className="dish-art-open"
          aria-label={`打开${name}的做法`}
          aria-haspopup="dialog"
          onClick={onOpenRecipe}
        >
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
        </button>
        {plannedCount > 0 ? (
          <span className="planned-tag">已点×{plannedCount}</span>
        ) : null}
        {tried ? <span className="tried-tag">做过</span> : null}
      </div>
      <h3 className="dish-name font-brush line-clamp-2 text-sumi">
        <BrushRuns text={name} />
      </h3>
      <button
        type="button"
        className="dish-recipe-entry focus-ring"
        data-recipe-for={id}
        aria-label={`查看${name}的做法`}
        aria-haspopup="dialog"
        onClick={onOpenRecipe}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path d="M3 1.5h7v9H3zM1 3h3M1 6h3M1 9h3M5 4h3M5 6h3" />
        </svg>
        做法
      </button>
      {action}
    </Card>
  );
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
      className="illus-blend dish-art absolute inset-0 h-full w-full object-contain"
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
    </div>
  );
}
