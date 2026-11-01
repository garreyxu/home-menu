CREATE TYPE "public"."meal" AS ENUM('breakfast', 'lunch', 'dinner');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notion_page_id" text,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text,
	"photo_key" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dishes_notion_page_id_unique" UNIQUE("notion_page_id")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_menu_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"meal" "meal" NOT NULL,
	"dish_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_slot_dish_unique" UNIQUE("weekly_menu_id","day_of_week","meal","dish_id"),
	CONSTRAINT "menu_items_day_of_week_range" CHECK ("menu_items"."day_of_week" >= 0 and "menu_items"."day_of_week" <= 6)
);
--> statement-breakpoint
CREATE TABLE "weekly_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_menus_week_start_unique" UNIQUE("week_start"),
	CONSTRAINT "weekly_menus_week_start_is_sunday" CHECK (extract(dow from "weekly_menus"."week_start") = 0)
);
--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_weekly_menu_id_weekly_menus_id_fk" FOREIGN KEY ("weekly_menu_id") REFERENCES "public"."weekly_menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_sort_order_idx" ON "categories" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "dishes_category_id_idx" ON "dishes" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "dishes_name_idx" ON "dishes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "menu_items_dish_id_idx" ON "menu_items" USING btree ("dish_id");