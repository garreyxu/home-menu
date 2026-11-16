import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DishFallback } from "@/components/dish-fallback";
import { RecipeBody } from "@/components/recipe-body";
import { SceneHeader } from "@/components/scene-header";
import { StampButton } from "@/components/stamp-button";
import { requireSession } from "@/lib/auth/require-session";
import { siteName } from "@/lib/site";
import { getActiveDrink } from "@/server/drinks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `酒单 · ${siteName}`,
};

export default async function DrinkDetailPage({
  params,
}: PageProps<"/drinks/[id]">) {
  await requireSession();
  const { id } = await params;
  const drink = await getActiveDrink(id);
  if (!drink) notFound();

  return (
    <div className="overflow-x-clip">
      <SceneHeader current="drinks" actions={<LogoutForm />} />
      <main className="drink-page">
        <article className="drink-sheet frame-panel frame-panel-a">
          <Link
            href="/drinks"
            className="week-nav-link frame-tag frame-tag-a focus-ring"
          >
            返回酒单
          </Link>
          <div className="drink-sheet-art dish-art-clip relative aspect-[4/3]">
            {drink.hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/drinks/${drink.id}/photo`}
                alt=""
                className="drink-photo absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="dish-art absolute inset-0">
                <DishFallback name={drink.name} />
              </div>
            )}
            {drink.tried ? <span className="tried-tag">已尝试</span> : null}
          </div>
          <h2 className="recipe-title font-brush text-sumi">{drink.name}</h2>
          {drink.baseSpirits.length > 0 || drink.flavors.length > 0 ? (
            <ul className="drink-chips" aria-label="酒的标签">
              {drink.baseSpirits.map((name) => (
                <li key={`base-${name}`} className="drink-chip drink-chip-base">
                  {name}
                </li>
              ))}
              {drink.flavors.map((name) => (
                <li key={`flavor-${name}`} className="drink-chip">
                  {name}
                </li>
              ))}
            </ul>
          ) : null}
          <section
            className="drink-section"
            aria-labelledby="drink-ingredients"
          >
            <h3 id="drink-ingredients" className="recipe-heading font-brush">
              配料
            </h3>
            <p>{drink.ingredients ?? "还没写配料"}</p>
          </section>
          <section className="drink-section" aria-labelledby="drink-steps">
            <h3 id="drink-steps" className="recipe-heading font-brush">
              步骤
            </h3>
            {drink.blocks.length > 0 ? (
              <RecipeBody blocks={drink.blocks} />
            ) : (
              <p>这杯还没写步骤</p>
            )}
          </section>
          {drink.sourceUrl ? (
            <p className="drink-source">
              <a
                href={drink.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                出处
              </a>
            </p>
          ) : null}
        </article>
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
