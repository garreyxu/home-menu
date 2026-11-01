import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
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
    // Key in private storage. Never store a public URL here.
    photoKey: text("photo_key"),
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
