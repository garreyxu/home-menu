import type { Metadata } from "next";
import { CategoryNav } from "@/components/category-nav";
import { MenuPlanner } from "@/components/menu-planner";
import { PixelButton } from "@/components/pixel-frame";
import { SceneHeader } from "@/components/scene-header";
import { requireSession } from "@/lib/auth/require-session";
import { firstQueryValue } from "@/lib/category-filter";
import { buildDishWall } from "@/server/menu-view";
import { listDishesByCategory } from "@/server/menu";
import { isSundayWeekStart, pacificDateIso, toWeekStart } from "@/server/week";
import { loadWeekMenu } from "@/server/week-menu";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "我家海上食堂",
  description: "按分类看家里的菜。",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  await requireSession();

  const params = await searchParams;
  const categoryParam = firstQueryValue(params.category);
  const weekParam = firstQueryValue(params.week);
  const weekQuery =
    weekParam && isSundayWeekStart(weekParam) ? weekParam : null;
  const catalog = await listDishesByCategory();
  const wall = buildDishWall(catalog, categoryParam);
  const week = await loadWeekMenu(weekQuery);
  const heading = wall.unknownCategory
    ? "没有这个分类"
    : (wall.selectedCategory ?? "全部菜品");
  const emptyMessage = wall.unknownCategory
    ? "没有这个分类。"
    : wall.dishes.length === 0
      ? wall.selectedCategory
        ? "这个分类还没有菜。"
        : "菜单还空着，等家里添几道菜。"
      : null;

  return (
    <div className="overflow-x-clip">
      <SceneHeader actions={<LogoutForm />} />
      <div className="flex w-full flex-col gap-4 px-4 pt-4 pb-24 sm:px-6 lg:flex-row lg:items-start lg:gap-6 lg:pb-4 min-[2560px]:gap-5 min-[2560px]:px-8">
        <CategoryNav
          categories={wall.categories}
          selected={wall.selectedCategory}
          week={weekQuery}
        />
        <MenuPlanner
          dishes={wall.dishes.map((dish) => ({
            id: dish.id,
            name: dish.name,
            categoryName: dish.categoryName,
          }))}
          heading={heading}
          pixelHeading={!wall.unknownCategory}
          emptyMessage={emptyMessage}
          week={week}
          currentWeekStart={toWeekStart(new Date())}
          todayIso={pacificDateIso(new Date())}
          categoryParam={categoryParam}
        />
      </div>
    </div>
  );
}

function LogoutForm() {
  // Plain HTML post. A Server Action or router.push would be a client
  // transition and can replay the cached dish wall after logout.
  return (
    <form action="/logout" method="post">
      <PixelButton type="submit" tone="cream" size="sm">
        退出
      </PixelButton>
    </form>
  );
}
