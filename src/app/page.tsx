import type { Metadata } from "next";
import { CategoryNav } from "@/components/category-nav";
import { DishCard } from "@/components/dish-card";
import { EmptyMenu } from "@/components/empty-menu";
import { PixelButton } from "@/components/pixel-frame";
import { SceneHeader } from "@/components/scene-header";
import { requireSession } from "@/lib/auth/require-session";
import { firstQueryValue } from "@/lib/category-filter";
import { cn } from "@/lib/utils";
import { buildDishWall } from "@/server/menu-view";
import { listDishesByCategory } from "@/server/menu";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "我家海上食堂",
  description: "按分类看家里的菜。",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  await requireSession();

  const params = await searchParams;
  const catalog = await listDishesByCategory();
  const wall = buildDishWall(catalog, firstQueryValue(params.category));
  const heading = wall.unknownCategory
    ? "没有这个分类"
    : (wall.selectedCategory ?? "全部菜品");

  return (
    <div className="overflow-x-clip">
      <SceneHeader actions={<LogoutForm />} />
      <div className="flex w-full flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:gap-6 min-[2560px]:gap-5 min-[2560px]:px-8">
        <CategoryNav
          categories={wall.categories}
          selected={wall.unknownCategory ? null : wall.selectedCategory}
        />
        <main className="min-w-0 flex-1">
          <div className="mb-4 inline-flex max-w-full flex-col gap-1 bg-cream px-3 py-2">
            <h2
              id="dish-wall-heading"
              className={cn(
                "text-ink",
                wall.unknownCategory
                  ? "font-sans text-lg font-semibold"
                  : "font-pixel pixel-type text-pixel-2",
              )}
            >
              {heading}
            </h2>
            <p className="text-sm text-driftwood">
              <span className="font-pixel pixel-type text-pixel-1 text-ink">
                {wall.dishes.length}
              </span>
              道菜
            </p>
          </div>
          {wall.unknownCategory ? (
            <EmptyMenu message="没有这个分类。" />
          ) : wall.dishes.length === 0 ? (
            <EmptyMenu
              message={
                wall.selectedCategory
                  ? "这个分类还没有菜。"
                  : "菜单还空着，等家里添几道菜。"
              }
            />
          ) : (
            <ul
              aria-labelledby="dish-wall-heading"
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] min-[2560px]:gap-5"
            >
              {wall.dishes.map((dish) => (
                <li key={dish.id} className="min-w-0">
                  <DishCard
                    name={dish.name}
                    categoryName={dish.categoryName}
                    photoUrl={null}
                  />
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}

function LogoutForm() {
  return (
    <form action="/logout" method="post">
      <PixelButton type="submit" tone="cream" size="sm">
        退出
      </PixelButton>
    </form>
  );
}
