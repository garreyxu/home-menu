import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gte, lte, lt, sql, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import { categories, dishes, menuItems, weeklyMenus } from "@/server/db/schema";
import { sampleDishCatalog } from "@/server/sample-catalog";
import { seedDishes } from "@/server/db/seed-data";
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
    if (ephemeral()) ephemeralWeeks().delete(row.weekStart);
    else {
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
  if (weeks || ephemeral()) return;
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
}
export async function leftoversE2E(runId: string) {
  const weeks = (await ownedWeeks(runId)).length;
  if (ephemeral()) return { weeks, dishes: 0, categories: 0 };
  const [d] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(dishes)
    .where(sql`${dishes.notionPageId} ~ ${`^e2e:${runId}:[1-9][0-9]*$`}`);
  const [c] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(categories)
    .where(eq(categories.name, `e2e-${runId}`));
  return { weeks, dishes: d.n, categories: c.n };
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
    catalog = sampleDishCatalog()
      .flatMap((c) =>
        c.dishes.map((d) => ({
          id: d.id,
          name: d.name,
          category: c.name,
          hasRecipe: !!seedDishes.find((s) => s.name === d.name)?.recipeBlocks
            ?.length,
        })),
      )
      .slice(0, n);
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
    catalog = (
      await getDb()
        .select()
        .from(dishes)
        .where(sql`${dishes.notionPageId} ~ ${`^e2e:${runId}:[1-9][0-9]*$`}`)
        .orderBy(dishes.notionPageId)
    ).map((d) => ({ id: d.id, name: d.name, category: name, hasRecipe: true }));
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
