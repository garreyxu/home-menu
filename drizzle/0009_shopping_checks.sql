CREATE TABLE "shopping_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_menu_id" uuid NOT NULL,
	"ingredient" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now(),
	"checked_by" text,
	CONSTRAINT "shopping_checks_week_ingredient_unique" UNIQUE("weekly_menu_id","ingredient")
);
--> statement-breakpoint
ALTER TABLE "shopping_checks" ADD CONSTRAINT "shopping_checks_weekly_menu_id_weekly_menus_id_fk" FOREIGN KEY ("weekly_menu_id") REFERENCES "public"."weekly_menus"("id") ON DELETE cascade ON UPDATE no action;