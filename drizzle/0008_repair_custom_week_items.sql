-- Repair production even when 0007 was stamped without its expression index.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY weekly_menu_id, day_of_week, meal, lower(btrim(custom_name))
    ORDER BY created_at ASC, id ASC
  ) AS position
  FROM menu_items
  WHERE custom_name IS NOT NULL
)
DELETE FROM menu_items USING ranked
WHERE menu_items.id = ranked.id AND ranked.position > 1;
--> statement-breakpoint
DROP INDEX IF EXISTS "menu_items_slot_custom_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_slot_custom_unique" ON "menu_items" USING btree ("weekly_menu_id","day_of_week","meal",lower(btrim("custom_name"))) WHERE "menu_items"."custom_name" is not null;
