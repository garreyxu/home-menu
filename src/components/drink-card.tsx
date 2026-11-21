import Link from "next/link";
import { BrushRuns } from "@/components/brush-runs";
import { DishFallback } from "@/components/dish-fallback";
import { Card } from "@/components/ui/card";
import { frameLetter } from "@/lib/frames";
import { cn } from "@/lib/utils";

export function DrinkCard({
  id,
  name,
  baseSpirits,
  flavors,
  tried,
  hasPhoto,
}: {
  id: string;
  name: string;
  baseSpirits: readonly string[];
  flavors: readonly string[];
  tried: boolean;
  hasPhoto: boolean;
}) {
  const letter = frameLetter(id);
  return (
    <Card
      className={cn(
        "frame-card drink-card h-full gap-3 bg-transparent p-3",
        `frame-card-${letter}`,
      )}
      data-drink-card={id}
    >
      <Link
        className="drink-open"
        href={`/drinks/${id}`}
        aria-label={`打开${name}`}
      >
        <div className="dish-art-clip relative aspect-[4/3]">
          {hasPhoto ? (
            // Our copy, served from this site. Notion file URLs are not used.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/drinks/${id}/photo`}
              alt=""
              className="drink-photo absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="dish-art absolute inset-0">
              <DishFallback name={name} />
            </div>
          )}
          {tried ? <span className="tried-tag">已尝试</span> : null}
        </div>
        <h3 className="dish-name font-brush line-clamp-2 text-sumi">
          <BrushRuns text={name} />
        </h3>
      </Link>
      {baseSpirits.length > 0 ? (
        <ul className="drink-chips" aria-label="基酒">
          {baseSpirits.map((name) => (
            <li key={name} className="drink-chip drink-chip-base">
              {name}
            </li>
          ))}
        </ul>
      ) : null}
      {flavors.length > 0 ? (
        <ul className="drink-chips" aria-label="口味">
          {flavors.map((name) => (
            <li key={name} className="drink-chip">
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
