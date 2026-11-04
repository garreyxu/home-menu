ALTER TABLE "notion_sync_runs" ADD COLUMN "errored" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notion_sync_runs" ADD COLUMN "would_remove" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notion_sync_runs" ADD COLUMN "removals_skipped" boolean DEFAULT false NOT NULL;