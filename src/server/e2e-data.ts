import "server-only";
import { clearLocalShoppingWeek } from "@/server/shopping-list";
import { createHash } from "node:crypto";
import { and, eq, gte, lte, lt, sql, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import { ephemeralDrinks, type EphemeralDrink } from "@/server/drinks";
import {
  categories,
  dishes,
  drinks,
  menuItems,
  weeklyMenus,
} from "@/server/db/schema";
import { sampleDishCatalog } from "@/server/sample-catalog";
import { seedDishes } from "@/server/db/seed-data";
import { CATEGORY_DISPLAY_ORDER } from "@/server/notion/category-order";
import {
  assertE2ECategory,
  assertE2EDish,
  assertE2EWeek,
  assertRunId,
  E2EInputError,
  FIRST_E2E_WEEK,
  LAST_E2E_WEEK,
} from "@/lib/e2e-guard";

// A durable ownership proof without a migration or process-local claim ledger.
export function claimedWeekId(runId: string, week: string, label = ""): string {
  assertRunId(runId);
  assertE2EWeek(week);
  const owner = createHash("sha256")
    .update(`home-menu:e2e:${runId}:${week}`)
    .digest("hex");
  const tail = createHash("sha256").update(label).digest("hex");
  const h = owner.slice(0, 16) + tail.slice(0, 16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
type EphemeralWeek = {
  id: string;
  weekStart: string;
  createdAt: Date;
  items: { createdAt?: Date }[];
};
function ephemeralWeeks() {
  // Same shared map as menu.ts; never clear the whole map (other runs own entries).
  const scope = globalThis as typeof globalThis & {
    __homeMenuEphemeralWeeks?: Map<string, EphemeralWeek>;
  };
  return (scope.__homeMenuEphemeralWeeks ??= new Map());
}
const ephemeral = () => !process.env.DATABASE_URL?.trim();
const BREAKFAST_CATEGORY = "早餐";
/** dishCount stops at 12, so this page id stays out of the shared e2e category. */
const BREAKFAST_FIXTURE_INDEX = 13;
function withBreakfastFixture<T extends { category: string }>(
  rows: readonly T[],
  limit: number | null,
): T[] {
  const breakfast = rows.filter((row) => row.category === BREAKFAST_CATEGORY);
  const rest = rows.filter((row) => row.category !== BREAKFAST_CATEGORY);
  return [...(limit === null ? rest : rest.slice(0, limit)), ...breakfast];
}
async function ownedWeeks(runId: string) {
  assertRunId(runId);
  const rows = ephemeral()
    ? [...ephemeralWeeks().values()].filter(
        (row) =>
          row.weekStart >= FIRST_E2E_WEEK && row.weekStart <= LAST_E2E_WEEK,
      )
    : await getDb()
        .select()
        .from(weeklyMenus)
        .where(
          and(
            gte(weeklyMenus.weekStart, FIRST_E2E_WEEK),
            lte(weeklyMenus.weekStart, LAST_E2E_WEEK),
          ),
        );
  return rows.filter((row) => {
    assertE2EWeek(row.weekStart);
    return (
      row.id.slice(0, 18) === claimedWeekId(runId, row.weekStart).slice(0, 18)
    );
  });
}
export async function cleanupE2E(
  runId: string,
  weeks?: string[],
  olderThan?: Date,
) {
  assertRunId(runId);
  weeks?.forEach(assertE2EWeek);
  const owned = await ownedWeeks(runId);
  if (!ephemeral() && !weeks) {
    // Run-tagged dish references can outlive the original week UUID (e.g. an
    // in-flight UI write after fixture teardown). Never follow them outside
    // the reserved window, and never delete another run's dishes or items.
    await getDb()
      .delete(menuItems)
      .where(
        and(
          inArray(
            menuItems.weeklyMenuId,
            getDb()
              .select({ id: weeklyMenus.id })
              .from(weeklyMenus)
              .where(
                and(
                  gte(weeklyMenus.weekStart, FIRST_E2E_WEEK),
                  lte(weeklyMenus.weekStart, LAST_E2E_WEEK),
                ),
              ),
          ),
          inArray(
            menuItems.dishId,
            getDb()
              .select({ id: dishes.id })
              .from(dishes)
              .where(
                sql`${dishes.notionPageId} ~ ${`^e2e:${runId}:[1-9][0-9]*$`}`,
              ),
          ),
          ...(olderThan ? [lt(menuItems.createdAt, olderThan)] : []),
        ),
      );
  }
  for (const row of owned) {
    if (weeks && !weeks.includes(row.weekStart)) continue;
    if (
      olderThan &&
      (row.createdAt >= olderThan ||
        ("items" in row &&
          row.items.some(
            (item: { createdAt?: Date }) =>
              item.createdAt && item.createdAt >= olderThan,
          )))
    )
      continue;
    if (ephemeral()) {
      clearLocalShoppingWeek(row.id);
      ephemeralWeeks().delete(row.weekStart);
    } else {
      // Explicit children-first deletion also works with a restrictive FK.
      // During stale sweeps retain a whole week if it contains young items.
      const weekScope = and(
        eq(weeklyMenus.id, row.id),
        eq(weeklyMenus.weekStart, row.weekStart),
        ...(olderThan
          ? [
              lt(weeklyMenus.createdAt, olderThan),
              sql`not exists (select 1 from ${menuItems} young where young.weekly_menu_id = ${weeklyMenus.id} and young.created_at >= ${olderThan})`,
            ]
          : []),
      );
      await getDb()
        .delete(menuItems)
        .where(
          inArray(
            menuItems.weeklyMenuId,
            getDb()
              .select({ id: weeklyMenus.id })
              .from(weeklyMenus)
              .where(weekScope),
          ),
        );
      await getDb()
        .delete(weeklyMenus)
        .where(
          and(
            eq(weeklyMenus.id, row.id),
            eq(weeklyMenus.weekStart, row.weekStart),
            ...(olderThan
              ? [
                  lt(weeklyMenus.createdAt, olderThan),
                  sql`not exists (select 1 from ${menuItems} where ${menuItems.weeklyMenuId} = ${weeklyMenus.id} and ${menuItems.createdAt} >= ${olderThan})`,
                ]
              : []),
          ),
        );
    }
  }
  if (ephemeral()) {
    if (!weeks) removeEphemeralRunDrink(runId);
    return;
  }
  if (weeks) return;
  const categoryName = `e2e-${runId}`;
  assertE2ECategory(runId, categoryName);
  // Regex is anchored and runId cannot contain regex metacharacters.
  await getDb()
    .delete(dishes)
    .where(
      and(
        sql`${dishes.notionPageId} ~ ${`^e2e:${runId}:[1-9][0-9]*$`}`,
        ...(olderThan
          ? [
              lt(dishes.createdAt, olderThan),
              sql`not exists (select 1 from ${menuItems} where ${menuItems.dishId} = ${dishes.id})`,
            ]
          : []),
      ),
    );
  await getDb()
    .delete(categories)
    .where(
      and(
        eq(categories.name, categoryName),
        ...(olderThan
          ? [
              lt(categories.createdAt, olderThan),
              sql`not exists (select 1 from ${dishes} where ${dishes.categoryId} = ${categories.id})`,
            ]
          : []),
      ),
    );
  await deleteStoredRunDrink(runId, olderThan);
}
export async function leftoversE2E(runId: string) {
  const weeks = (await ownedWeeks(runId)).length;
  if (ephemeral()) {
    return {
      weeks,
      dishes: 0,
      categories: 0,
      drinks: ephemeralDrinks().has(e2eDrinkNotionId(runId)) ? 1 : 0,
    };
  }
  const [d] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(dishes)
    .where(sql`${dishes.notionPageId} ~ ${`^e2e:${runId}:[1-9][0-9]*$`}`);
  const [c] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(categories)
    .where(eq(categories.name, `e2e-${runId}`));
  const [drinkCount] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(drinks)
    .where(eq(drinks.notionPageId, e2eDrinkNotionId(runId)));
  return { weeks, dishes: d.n, categories: c.n, drinks: drinkCount.n };
}
async function sweep(runId: string) {
  if (ephemeral()) {
    // Ownership is verified from the run encoded in our separate local lease map.
    const leases = localLeases();
    for (const [other, created] of leases)
      if (other !== runId && created < Date.now() - 6 * 3600_000) {
        await cleanupE2E(other, undefined, new Date(Date.now() - 6 * 3600_000));
        if (!(await ownedWeeks(other)).length) leases.delete(other);
      }
    leases.set(runId, Date.now());
    return;
  }
  const old = await getDb()
    .select()
    .from(categories)
    .where(
      and(
        sql`${categories.name} ~ '^e2e-[a-z0-9-]{4,40}$'`,
        lt(categories.createdAt, new Date(Date.now() - 6 * 3600_000)),
      ),
    );
  const cutoff = new Date(Date.now() - 6 * 3600_000);
  for (const category of old) {
    const other = category.name.slice(4);
    if (other === runId) continue;
    // A restarted old run can have young rows. Preserve that entire run.
    if ((await ownedWeeks(other)).some((row) => row.createdAt >= cutoff))
      continue;
    const [young] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(dishes)
      .where(
        and(
          sql`${dishes.notionPageId} ~ ${`^e2e:${other}:[1-9][0-9]*$`}`,
          gte(dishes.createdAt, cutoff),
        ),
      );
    if (!young.n) await cleanupE2E(other, undefined, cutoff);
  }
}
function localLeases() {
  const scope = globalThis as typeof globalThis & {
    __homeMenuE2ELeases?: Map<string, number>;
  };
  return (scope.__homeMenuE2ELeases ??= new Map());
}
export async function seedE2E(
  runId: string,
  weeks: string[],
  n = 6,
  label = "",
) {
  assertRunId(runId);
  weeks.forEach(assertE2EWeek);
  if (!Number.isInteger(n) || n < 6 || n > 12)
    throw new E2EInputError("Invalid dish count");
  if (ephemeral() && process.env.VERCEL_ENV !== undefined)
    throw new Error("Preview database required");
  await sweep(runId);
  let catalog: {
    id: string;
    name: string;
    category: string;
    hasRecipe: boolean;
  }[];
  if (ephemeral()) {
    catalog = withBreakfastFixture(
      sampleDishCatalog().flatMap((c) =>
        c.dishes.map((d) => ({
          id: d.id,
          name: d.name,
          category: c.name,
          hasRecipe: !!seedDishes.find((s) => s.name === d.name)?.recipeBlocks
            ?.length,
        })),
      ),
      n,
    );
  } else {
    const name = `e2e-${runId}`;
    assertE2ECategory(runId, name);
    await getDb()
      .insert(categories)
      .values({ name, sortOrder: -1000 })
      .onConflictDoNothing();
    const [category] = await getDb()
      .select()
      .from(categories)
      .where(eq(categories.name, name));
    for (let i = 1; i <= n; i++) {
      const notionPageId = `e2e:${runId}:${i}`;
      assertE2EDish(runId, notionPageId);
      await getDb()
        .insert(dishes)
        .values({
          categoryId: category.id,
          notionPageId,
          name:
            i === 6 ? "秘制蜜汁叉烧配手工鸡蛋面条" : seedDishes[i - 1]!.name,
          ingredients: seedDishes[i - 1]!.ingredients ?? null,
          isActive: true,
          hasBody: true,
          recipeBlocks: [
            {
              type: "paragraph",
              spans: [{ text: "鸡蛋打散，准备10 min，炖60 min" }],
            },
            {
              type: "bulleted_list_item",
              spans: [{ text: "酱豆腐1勺(option)" }],
              children: [],
            },
            {
              type: "numbered_list_item",
              spans: [{ text: "焖5 mins，加盐（OPTIONAL）" }],
              children: [],
            },
          ],
        })
        .onConflictDoNothing();
    }
    const breakfastSeed = seedDishes.find(
      (dish) => dish.categoryName === BREAKFAST_CATEGORY,
    );
    if (!breakfastSeed) throw new Error("Seed catalog is missing 早餐");
    const breakfastSort = CATEGORY_DISPLAY_ORDER.indexOf(BREAKFAST_CATEGORY);
    await getDb()
      .insert(categories)
      .values({ name: BREAKFAST_CATEGORY, sortOrder: breakfastSort })
      .onConflictDoNothing();
    const [breakfastCategory] = await getDb()
      .select()
      .from(categories)
      .where(eq(categories.name, BREAKFAST_CATEGORY));
    if (!breakfastCategory) throw new Error("Seed catalog is missing 早餐");
    const breakfastNotionId = `e2e:${runId}:${BREAKFAST_FIXTURE_INDEX}`;
    assertE2EDish(runId, breakfastNotionId);
    await getDb()
      .insert(dishes)
      .values({
        categoryId: breakfastCategory.id,
        notionPageId: breakfastNotionId,
        name: breakfastSeed.name,
        ingredients: breakfastSeed.ingredients ?? null,
        description: breakfastSeed.description,
        isActive: true,
        hasBody: true,
        recipeBlocks: [
          {
            type: "numbered_list_item",
            spans: [{ text: "发面，包馅，蒸 15 分钟" }],
            children: [],
          },
        ],
      })
      .onConflictDoNothing();
    catalog = withBreakfastFixture(
      (
        await getDb()
          .select({
            id: dishes.id,
            name: dishes.name,
            category: categories.name,
            hasRecipe: dishes.hasBody,
          })
          .from(dishes)
          .innerJoin(categories, eq(dishes.categoryId, categories.id))
          .where(sql`${dishes.notionPageId} ~ ${`^e2e:${runId}:[1-9][0-9]*$`}`)
          .orderBy(dishes.notionPageId)
      ).map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        hasRecipe: d.hasRecipe,
      })),
      null,
    );
  }
  for (const week of weeks) {
    const id = claimedWeekId(runId, week, label);
    if (ephemeral()) {
      const existing = ephemeralWeeks().get(week);
      if (existing && existing.id !== id) return null;
      if (!existing)
        ephemeralWeeks().set(week, {
          id,
          weekStart: week,
          createdAt: new Date(),
          items: [],
        });
    } else {
      await getDb()
        .insert(weeklyMenus)
        .values({ id, weekStart: week })
        .onConflictDoNothing();
      const [existing] = await getDb()
        .select()
        .from(weeklyMenus)
        .where(eq(weeklyMenus.weekStart, week));
      if (existing.id !== id) return null;
    }
  }
  return { runId, weeks, dishes: catalog };
}

export function e2eDrinkNotionId(runId: string): string {
  assertRunId(runId);
  return `e2e-drink:${runId}`;
}

export function e2eDrinkRowId(runId: string): string {
  assertRunId(runId);
  const hash = createHash("sha256")
    .update(`home-menu:e2e-drink:${runId}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const E2E_DRINK_STEP = "倒入金酒，再注汤力水。";

export async function seedDrinkE2E(runId: string) {
  assertRunId(runId);
  if (ephemeral() && process.env.VERCEL_ENV !== undefined) {
    throw new Error("Preview database required");
  }
  const notionPageId = e2eDrinkNotionId(runId);
  const row: EphemeralDrink = {
    id: e2eDrinkRowId(runId),
    notionPageId,
    name: `夜来香-${runId}`,
    baseSpirits: ["金酒"],
    flavors: ["清爽"],
    ingredients: "金酒 45ml、汤力水",
    sourceUrl: "https://example.com/night-bloom",
    tried: true,
    hasPhoto: false,
    blocks: [
      {
        type: "numbered_list_item",
        spans: [{ text: E2E_DRINK_STEP }],
        children: [],
      },
    ],
    photo: null,
    photoType: null,
    isActive: true,
    createdAt: new Date(),
  };
  if (ephemeral()) {
    ephemeralDrinks().set(notionPageId, row);
  } else {
    await getDb()
      .insert(drinks)
      .values({
        id: row.id,
        notionPageId,
        name: row.name,
        baseSpirits: [...row.baseSpirits],
        flavors: [...row.flavors],
        ingredients: row.ingredients,
        sourceUrl: row.sourceUrl,
        tried: true,
        hasBody: true,
        recipeBlocks: row.blocks,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: drinks.notionPageId,
        set: {
          name: row.name,
          baseSpirits: [...row.baseSpirits],
          flavors: [...row.flavors],
          ingredients: row.ingredients,
          sourceUrl: row.sourceUrl,
          tried: true,
          hasBody: true,
          recipeBlocks: row.blocks,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }
  return {
    id: row.id,
    name: row.name,
    baseSpirit: row.baseSpirits[0],
    flavor: row.flavors[0],
    ingredients: row.ingredients,
    sourceUrl: row.sourceUrl,
    step: E2E_DRINK_STEP,
  };
}

export async function cleanupDrinkE2E(runId: string) {
  assertRunId(runId);
  if (ephemeral()) {
    for (const [key, drink] of ephemeralDrinks()) {
      if (drink.notionPageId.startsWith("e2e-drink:")) {
        ephemeralDrinks().delete(key);
      }
    }
    return;
  }
  await deleteStoredRunDrink(runId);
  const cutoff = new Date(Date.now() - 6 * 3600_000);
  await getDb()
    .delete(drinks)
    .where(
      and(
        sql`${drinks.notionPageId} ~ '^e2e-drink:[a-z0-9-]{4,40}$'`,
        lt(drinks.createdAt, cutoff),
      ),
    );
}

function removeEphemeralRunDrink(runId: string) {
  ephemeralDrinks().delete(e2eDrinkNotionId(runId));
}

async function deleteStoredRunDrink(runId: string, olderThan?: Date) {
  await getDb()
    .delete(drinks)
    .where(
      and(
        eq(drinks.notionPageId, e2eDrinkNotionId(runId)),
        ...(olderThan ? [lt(drinks.createdAt, olderThan)] : []),
      ),
    );
}
