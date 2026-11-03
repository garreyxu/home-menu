import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { MEALS } from "../meals";

export const mealEnum = pgEnum("meal", MEALS);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("categories_sort_order_idx").on(table.sortOrder)],
);

export const dishes = pgTable(
  "dishes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notionPageId: text("notion_page_id").unique(),
    name: text("name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    description: text("description"),
    // Private blob pathname, such as dishes/<notion-id>. Never a URL.
    photoKey: text("photo_key"),
    // Stable identity of the Notion file, without the expiring query string.
    photoSourceKey: text("photo_source_key"),
    cookTime: text("cook_time"),
    ingredients: text("ingredients"),
    rating: text("rating"),
    tried: boolean("tried").notNull().default(false),
    cuisines: jsonb("cuisines")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    mainIngredient: text("main_ingredient"),
    body: jsonb("body"),
    // True when the Notion page body has at least one block.
    hasBody: boolean("has_body").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("dishes_category_id_idx").on(table.categoryId),
    index("dishes_name_idx").on(table.name),
  ],
);

export const notionSyncRuns = pgTable(
  "notion_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    heartbeatAt: timestamp("heartbeat_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    added: integer("added").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    delisted: integer("delisted").notNull().default(0),
    imported: integer("imported").notNull().default(0),
    withPhoto: integer("with_photo").notNull().default(0),
    placeholder: integer("placeholder").notNull().default(0),
    onWall: integer("on_wall").notNull().default(0),
    onWallWithPhoto: integer("on_wall_with_photo").notNull().default(0),
    notTried: integer("not_tried").notNull().default(0),
    processed: integer("processed").notNull().default(0),
    total: integer("total"),
    skipped: jsonb("skipped")
      .$type<{ pageId: string; name: string | null; reason: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    warnings: jsonb("warnings")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("notion_sync_runs_one_running_idx")
      .on(table.status)
      .where(sql`${table.status} = 'running'`),
    check(
      "notion_sync_runs_status",
      sql`${table.status} in ('running', 'succeeded', 'failed')`,
    ),
  ],
);

export const weeklyMenus = pgTable(
  "weekly_menus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weekStart: date("week_start", { mode: "string" }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "weekly_menus_week_start_is_sunday",
      sql`extract(dow from ${table.weekStart}) = 0`,
    ),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weeklyMenuId: uuid("weekly_menu_id")
      .notNull()
      .references(() => weeklyMenus.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(),
    meal: mealEnum("meal").notNull(),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("menu_items_slot_dish_unique").on(
      table.weeklyMenuId,
      table.dayOfWeek,
      table.meal,
      table.dishId,
    ),
    check(
      "menu_items_day_of_week_range",
      sql`${table.dayOfWeek} >= 0 and ${table.dayOfWeek} <= 6`,
    ),
    index("menu_items_dish_id_idx").on(table.dishId),
  ],
);

export const categoriesRelations = relations(categories, ({ many }) => ({
  dishes: many(dishes),
}));

export const dishesRelations = relations(dishes, ({ one, many }) => ({
  category: one(categories, {
    fields: [dishes.categoryId],
    references: [categories.id],
  }),
  menuItems: many(menuItems),
}));

export const weeklyMenusRelations = relations(weeklyMenus, ({ many }) => ({
  items: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  weeklyMenu: one(weeklyMenus, {
    fields: [menuItems.weeklyMenuId],
    references: [weeklyMenus.id],
  }),
  dish: one(dishes, {
    fields: [menuItems.dishId],
    references: [dishes.id],
  }),
}));
