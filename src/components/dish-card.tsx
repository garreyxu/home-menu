import type { ReactNode } from "react";
import Image from "next/image";
import { PixelFrame } from "@/components/pixel-frame";
import { Card } from "@/components/ui/card";

export type DishCardProps = {
  name: string;
  categoryName: string;
  /**
   * Optional image URL. Null keeps the pixel plate.
   * Notion photos are not stored. A later change may pass a static illustration.
   */
  photoUrl?: string | null;
  tried?: boolean;
  plannedCount?: number;
  action?: ReactNode;
};

export function DishCard({
  name,
  categoryName,
  photoUrl = null,
  tried = false,
  plannedCount = 0,
  action = null,
}: DishCardProps) {
  const initial = Array.from(name)[0] ?? "菜";

  return (
    <PixelFrame className="dish-card h-full w-full" faceClassName="h-full">
      <Card className="h-full bg-transparent p-3 sm:p-4">
        <div className="relative">
          <div
            className="pixel-inset relative aspect-square bg-[#d5efe8]"
            data-asset="dish-photo"
          >
            {photoUrl ? (
              <Image
                src={photoUrl}
                alt={name}
                fill
                unoptimized
                sizes="(min-width: 1024px) 280px, 50vw"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <div
                  className="dish-plate"
                  role="img"
                  aria-label={`${name}，还没有照片`}
                  data-asset="plate"
                >
                  <span
                    aria-hidden="true"
                    className="font-sans text-2xl font-semibold text-ink lg:text-3xl"
                  >
                    {initial}
                  </span>
                </div>
              </div>
            )}
          </div>
          {plannedCount > 0 ? (
            <span className="dish-badge font-pixel pixel-type text-pixel-1">
              已点×{plannedCount}
            </span>
          ) : null}
        </div>
        <h3 className="line-clamp-2 font-sans text-base font-semibold leading-snug text-ink lg:text-lg min-[2560px]:text-xl">
          {name}
        </h3>
        <p className="font-pixel pixel-type text-pixel-1 text-driftwood">
          {categoryName}
        </p>
        {tried ? (
          <p className="font-sans text-xs font-medium leading-none text-kelp">
            做过
          </p>
        ) : null}
        {action}
      </Card>
    </PixelFrame>
  );
}

export function DishCardSkeleton() {
  return (
    <PixelFrame className="h-full w-full" faceClassName="h-full">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4" aria-hidden="true">
        <div className="pixel-skeleton pixel-inset aspect-square" />
        <div className="pixel-skeleton h-5 w-2/3" />
        <div className="pixel-skeleton h-4 w-1/3" />
      </div>
    </PixelFrame>
  );
}
