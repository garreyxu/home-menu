import type { Metadata } from "next";
import Link from "next/link";
import { DrinkCard } from "@/components/drink-card";
import { EmptyMenu } from "@/components/empty-menu";
import { SceneHeader } from "@/components/scene-header";
import { SealBadge } from "@/components/seal-badge";
import { StampButton } from "@/components/stamp-button";
import { firstQueryValue } from "@/lib/category-filter";
import {
  drinkBaseOptions,
  drinkFilterHref,
  filterDrinksByBase,
} from "@/lib/drinks";
import { requireSession } from "@/lib/auth/require-session";
import { frameLetter } from "@/lib/frames";
import { siteName } from "@/lib/site";
import { listActiveDrinks } from "@/server/drinks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `酒单 · ${siteName}`,
  description: "家里的鸡尾酒，只看不排。",
};

export default async function DrinksPage({
  searchParams,
}: PageProps<"/drinks">) {
  await requireSession();
  const params = await searchParams;
  const catalog = await listActiveDrinks();
  const bases = drinkBaseOptions(catalog);
  const requested = firstQueryValue(params.base)?.trim() ?? "";
  const base = requested && bases.includes(requested) ? requested : null;
  const drinks = !requested
    ? catalog
    : base
      ? filterDrinksByBase(catalog, base)
      : [];

  return (
    <div className="overflow-x-clip">
      <SceneHeader current="drinks" actions={<LogoutForm />} />
      <main className="drink-page">
        <div className="drink-heading">
          <SealBadge id="drinks-seal" label="酒" decorative />
          <div>
            <h2 className="section-title font-brush text-sumi">酒单</h2>
            <p className="text-sm text-sumi-soft">
              {catalog.length > 0 ? (
                <>
                  <span className="font-bold text-sumi">{catalog.length}</span>
                  杯，只看配方
                </>
              ) : (
                "只看配方，不进一周菜单"
              )}
            </p>
          </div>
        </div>
        {bases.length > 0 ? (
          <nav aria-label="基酒" className="drink-filter">
            <Link
              href={drinkFilterHref(null)}
              className={`wood-tag frame-tag frame-tag-${frameLetter("全部")} focus-ring`}
              aria-current={requested ? undefined : "page"}
            >
              <span className="wood-label font-brush">全部</span>
            </Link>
            {bases.map((name) => (
              <Link
                key={name}
                href={drinkFilterHref(name)}
                className={`wood-tag frame-tag frame-tag-${frameLetter(name)} focus-ring`}
                aria-current={base === name ? "page" : undefined}
              >
                <span className="wood-label font-brush" title={name}>
                  {name}
                </span>
              </Link>
            ))}
          </nav>
        ) : null}
        {catalog.length === 0 ? (
          <EmptyMenu message="酒单还空着，等家里添几杯。" />
        ) : drinks.length === 0 ? (
          <EmptyMenu message="这基酒还没有酒。" />
        ) : (
          <ul className="drink-grid">
            {drinks.map((drink) => (
              <li key={drink.id}>
                <DrinkCard {...drink} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function LogoutForm() {
  return (
    <form action="/logout" method="post">
      <StampButton type="submit" tone="outline">
        退出
      </StampButton>
    </form>
  );
}
