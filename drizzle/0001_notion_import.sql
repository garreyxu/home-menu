CREATE TABLE "notion_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"added" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"delisted" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"with_photo" integer DEFAULT 0 NOT NULL,
	"placeholder" integer DEFAULT 0 NOT NULL,
	"on_wall" integer DEFAULT 0 NOT NULL,
	"on_wall_with_photo" integer DEFAULT 0 NOT NULL,
	"not_tried" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"total" integer,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	CONSTRAINT "notion_sync_runs_status" CHECK ("notion_sync_runs"."status" in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "photo_source_key" text;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "cook_time" text;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "ingredients" text;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "rating" text;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "tried" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "cuisines" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "main_ingredient" text;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "body" jsonb;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "has_body" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notion_sync_runs_one_running_idx" ON "notion_sync_runs" USING btree ("status") WHERE "notion_sync_runs"."status" = 'running';