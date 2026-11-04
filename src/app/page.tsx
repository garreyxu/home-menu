import type { Metadata } from "next";
import { MenuPlanner } from "@/components/menu-planner";
import { SceneHeader } from "@/components/scene-header";
import { StampButton } from "@/components/stamp-button";
import { requireSession } from "@/lib/auth/require-session";
import { firstQueryValue } from "@/lib/category-filter";
import { toHomeWall } from "@/lib/home-wall";
import { illustrationForDish, publicFileExists } from "@/lib/illustrations";
import { buildDishWall } from "@/server/menu-view";
import { listDishesByCategory } from "@/server/menu";
import { isSundayWeekStart, pacificDateIso, toWeekStart } from "@/server/week";
import { loadWeekMenu } from "@/server/week-menu";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "我家食堂",
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
  const built = buildDishWall(catalog, categoryParam);
  const wall = toHomeWall(built, (dishId) =>
    illustrationForDish(dishId, publicFileExists),
  );
  const week = await loadWeekMenu(weekQuery);

  return (
    <div className="overflow-x-clip">
      <SceneHeader actions={<LogoutForm />} />
      <MenuPlanner
        wall={wall}
        week={week}
        currentWeekStart={toWeekStart(new Date())}
        todayIso={pacificDateIso(new Date())}
        categoryParam={categoryParam}
        weekQuery={weekQuery}
      />
    </div>
  );
}

function LogoutForm() {
  // Plain HTML post. A Server Action or router.push would be a client
  // transition and can replay the cached dish wall after logout.
  return (
    <form action="/logout" method="post">
      <StampButton type="submit" tone="outline">
        退出
      </StampButton>
    </form>
  );
}
