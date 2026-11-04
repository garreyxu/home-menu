ALTER TABLE "notion_sync_runs" ADD COLUMN "seeds_retired" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notion_sync_runs" ADD COLUMN "no_step_pages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notion_sync_runs" ADD COLUMN "errored_pages" jsonb DEFAULT '[]'::jsonb NOT NULL;