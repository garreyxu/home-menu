ALTER TABLE "notion_sync_runs" ADD COLUMN "deleted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notion_sync_runs" ADD COLUMN "inactivated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notion_sync_runs" ADD COLUMN "tried" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notion_sync_runs" ADD COLUMN "no_steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" DROP COLUMN "photo_source_key";--> statement-breakpoint
ALTER TABLE "notion_sync_runs" DROP COLUMN "delisted";--> statement-breakpoint
ALTER TABLE "notion_sync_runs" DROP COLUMN "with_photo";--> statement-breakpoint
ALTER TABLE "notion_sync_runs" DROP COLUMN "placeholder";--> statement-breakpoint
ALTER TABLE "notion_sync_runs" DROP COLUMN "on_wall_with_photo";--> statement-breakpoint
ALTER TABLE "notion_sync_runs" DROP COLUMN "not_tried";